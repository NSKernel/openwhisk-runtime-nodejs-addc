/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Object which encapsulates a first-class function, the user code for an action.
 *
 * This file (runner.js) must currently live in root directory for nodeJsAction.
 */
const fs = require('fs');
const path = require('path');
const Queue = require('bullmq-addc').Queue;
const Job = require('bullmq-addc').Job;
const QueueEvents = require('bullmq-addc').QueueEvents;

const QUEUE_PAYLOAD_TYPE_FILE = 0;
const QUEUE_PAYLOAD_TYPE_CODE = 1;

const REDIS_QUEUE_HOST = process.env.REDIS_QUEUE_HOST || 'localhost';
const REDIS_QUEUE_PORT = process.env.REDIS_QUEUE_PORT
	? parseInt(process.env.REDIS_QUEUE_PORT)
	: 6379;

const workerQueue = new Queue('worker-queue', {
	connection: {
		host: REDIS_QUEUE_HOST,
		port: REDIS_QUEUE_PORT,
	},
});

const queueEvents = new QueueEvents('worker-queue', {
    connection: {
        host: REDIS_QUEUE_HOST,
        port: REDIS_QUEUE_PORT,
    },
});

const DEFAULT_REMOVE_CONFIG = {
	removeOnComplete: false,
	removeOnFail: {
		age: 3600,
	},
};

/** Initializes the handler for the user function. */
function initializeActionHandler(message) {
    if (message.binary) {
        // The code is a base64-encoded zip file.
        ext = detectFileType(message.code)
        if (ext == 'unsupported'){
            return Promise.reject("There was an error uncompressing the action archive.");
        }
        return extractInTmpDir(message.code)
            .then(moduleDir => {
                let parts = splitMainHandler(message.main);
                if (parts === undefined) {
                    // message.main is guaranteed to not be empty but be defensive anyway
                    return Promise.reject('Name of main function is not valid.');
                }

                // If there is only one property in the "main" handler, it is the function name
                // and the module name is specified either from package.json or assumed to be index.js.
                let [index, main] = parts;

                // Set the executable directory to the project dir.
                process.chdir(moduleDir);

                if (index === undefined && !fs.existsSync('package.json') && !fs.existsSync('index.js')) {
                    return Promise.reject('Zipped actions must contain either package.json or index.js at the root.');
                }

                // install npm modules during init if source code zip doesn´t containt them
                // check if package.json exists and node_modules don`t
                if (fs.existsSync('package.json') && !fs.existsSync('./node_modules/')) {
                    var package_json = JSON.parse(fs.readFileSync('package.json', 'utf8'));
                    if (package_json.hasOwnProperty('dependencies')) {
                        if (Object.keys(package_json.dependencies).length > 0) {
                            exec("npm install")
                        }
                    }
                }

                //  The module to require.
                let whatToRequire = index !== undefined ? path.join(moduleDir, index) : moduleDir;
                let handler = assertMainIsFunction(eval('require("' + whatToRequire + '").' + main));
                if (handler === 0) {
                    var localenv = {};
                    if (message.env && typeof message.env == 'object') {
                        //console.log("Init message: " + JSON.stringify(message));
                        Object.keys(message.env).forEach(k => {
                            let val = message.env[k];
                            if (typeof val !== 'object' || val == null) {
                                localenv[k] = val ? val.toString() : "";
                            } else {
                                localenv[k] = JSON.stringify(val);
                            }
                        });
                    }
                    return Promise.resolve({ type: QUEUE_PAYLOAD_TYPE_FILE, whatToRequire: whatToRequire, main: main, code: null, env: localenv });
                }
                else
                    return Promise.reject("Action entrypoint '" + main + "' is not a function.");
            })
            .catch(error => Promise.reject(error));
    } else try {
        let code = `(function(){
            ${message.code}
            try {
              return ${message.main}
            } catch (e) {
              if (e.name === 'ReferenceError') {
                 return module.exports.${message.main} || exports.${message.main}
              } else throw e
            }
        })()`;
        let handler = assertMainIsFunction(eval(code));
        if (handler === 0) {
            var localenv = {};
            if (message.env && typeof message.env == 'object') {
                //console.log("Init message: " + JSON.stringify(message));
                Object.keys(message.env).forEach(k => {
                    let val = message.env[k];
                    if (typeof val !== 'object' || val == null) {
                        localenv[k] = val ? val.toString() : "";
                    } else {
                        localenv[k] = JSON.stringify(val);
                    }
                });
            }
            return Promise.resolve({ type: QUEUE_PAYLOAD_TYPE_CODE, whatToRequire: null, main: null, code: code, env: localenv });
        }
        else
            return Promise.reject("Action entrypoint '" + message.main + "' is not a function.");
    } catch (e) {
        return Promise.reject(e);
    }
}

class NodeActionRunner {

    constructor(handler) {
        this.userScriptMain = handler;
    }

    run(args) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('[' + Date.now() + '] New run request. Add to worker queue');
                console.log('[' + Date.now() + '] typeof workerQueue = ' + typeof workerQueue);
                var job = await workerQueue.add('job', { handler: this.userScriptMain, args: args }, DEFAULT_REMOVE_CONFIG);
                console.log('Job ' + job.id + ' queued');
                let jobID = job.id;

                await job.waitUntilFinished(queueEvents);
                console.log('Job ' + job.id + ' done');

                var result = (await Job.fromId(workerQueue, job.id)).returnvalue;

                await job.remove();
                console.log('Job' + jobID + ' removed')
            } catch (e) {
                reject(e);
            }

            this.finalizeResult(result, resolve);
        });
    };

    finalizeResult(result, resolve) {
        // Non-promises/undefined instantly resolve.
        Promise.resolve(result).then(resolvedResult => {
            // This happens, e.g. if you just have "return;"
            if (typeof resolvedResult === "undefined") {
                resolvedResult = {};
            }
            resolve(resolvedResult);
        }).catch(error => {
            // A rejected Promise from the user code maps into a
            // successful promise wrapping a whisk-encoded error.

            // Special case if the user just called "reject()".
            if (!error) {
                resolve({error: {}});
            } else {
                // Replace unsupported require statement with
                // dynamically import npm serialize-error package returning a promise
                import('serialize-error')
                .then(module => {
                    // if serialize-error is imported correctly the function resolves with a serializedError
                    resolve({error: module.serializeError(error)});
                })
                .catch(err => {
                    // When there is an error to serialize the error object, resolve with the error message
                    resolve({error: err.message });
                });
            }
        });
    }
}

/**
 * Copies the base64 encoded zip file contents to a temporary location,
 * decompresses it and returns the name of that directory.
 *
 * Note that this makes heavy use of shell commands because the environment is expected
 * to provide the required executables.
 */
function extractInTmpDir(archiveFileContents) {
    const mkTempCmd = "mktemp -d XXXXXXXX";
    return exec(mkTempCmd).then(tmpDir => {
        return new Promise((resolve, reject) => {
            ext = detectFileType(archiveFileContents)
            if (ext == 'unsupported'){
                reject("There was an error Detecting the File type");
            }
            const archiveFile = path.join(tmpDir, "action."+ ext);
            fs.writeFile(archiveFile, archiveFileContents, "base64", err => {
                if (!err) resolve(archiveFile);
                else reject("There was an error reading the action archive.");
            });
        });
    }).then(archiveFile => {
        return exec(mkTempCmd).then(tmpDir => {
            if (ext === 'zip') {
                return exec("unzip -qq " + archiveFile + " -d " + tmpDir)
                .then(res => path.resolve(tmpDir))
                .catch(error => Promise.reject("There was an error uncompressing the action archive."));
            } else if (ext === 'tar.gz') {
                return exec("tar -xzf " + archiveFile + " -C " + tmpDir + " > /dev/null")
                .then(res => path.resolve(tmpDir))
                .catch(error => Promise.reject("There was an error uncompressing the action archive."));
            } else {
                  return Promise.reject("There was an error uncompressing the action archive.");
            }
        });
    });
}

/** Helper function to run shell commands. */
function exec(cmd) {
    const child_process = require('child_process');

    return new Promise((resolve, reject) => {
        child_process.exec(cmd, (error, stdout, stderr) => {
            if (!error) {
                resolve(stdout.trim());
            } else {
                reject(stderr.trim());
            }
        });
    });
}

/**
 * Splits handler into module name and path to main.
 * If the string contains no '.', return [ undefined, the string ].
 * If the string contains one or more '.', return [ string up to first period, rest of the string after ].
 */
function splitMainHandler(handler) {
    let matches = handler.match(/^([^.]+)$|^([^.]+)\.(.+)$/);
    if (matches && matches.length == 4) {
        let index = matches[2];
        let main = matches[3] || matches[1];
        return [index, main]
    } else return undefined
}

function assertMainIsFunction(handler) {
    if (typeof handler === 'function') {
        return 0;
    } else {
        return 1;
    }
}

module.exports = {
    NodeActionRunner,
    initializeActionHandler
};

// helper function to detect if base64string is zip or tar.gz
// and returns the file ending
function detectFileType(base64String) {
    // Decode the base64 string into binary data
    const binaryData = Buffer.from(base64String, 'base64');

    // Examine the first few bytes of the binary data to determine the file type
    const magicNumber = binaryData.slice(0, 4).toString('hex');

    if (magicNumber === '504b0304') {
      return 'zip';
    // GZIP: 1f8b0808 maximum compression level,  1f8b0800 default compression
    } else if (magicNumber === '1f8b0808' || magicNumber === '1f8b0800') {
      return 'tar.gz';
    } else {
        return 'unsupported';
    }
}
