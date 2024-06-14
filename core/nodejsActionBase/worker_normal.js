const Worker = require('bullmq-addc').Worker;
const Job = require('bullmq-addc').Job;
const process = require('process');
const addc_addon = require('./addc-addon/build/Release/addc_addon');

const REDIS_QUEUE_HOST = process.env.REDIS_QUEUE_HOST || 'localhost';
const REDIS_QUEUE_PORT = process.env.REDIS_QUEUE_PORT
	? parseInt(process.env.REDIS_QUEUE_PORT)
	: 6379;

let worker;

const QUEUE_PAYLOAD_TYPE_FILE = 0;
const QUEUE_PAYLOAD_TYPE_CODE = 1;

async function jobProcessor(job) {
	await job.log('Worker PID ' + process.pid + `: Started processing job with id ${job.id}`);
	// console.log(`Job with id ${job.id}`, job.data);
	let payload = job.data;

	if (payload.handler.type === QUEUE_PAYLOAD_TYPE_FILE) {
		let handler = eval('require("' + payload.handler.whatToRequire + '").' + payload.handler.main);
		return handler(payload.args);
	}
	if (payload.handler.type === QUEUE_PAYLOAD_TYPE_CODE) {
		let handler = eval(payload.handler.code);
		return handler(payload.args);
	}
};

function setUpWorker() {
	worker = new Worker('worker-queue', jobProcessor, {
		connection: {
			host: REDIS_QUEUE_HOST,
			port: REDIS_QUEUE_PORT,
		},
		autorun: true,
		checkin: null, // We are a regular worker so no checkin
		register: null,
	});

	worker.on('completed', (job, returnvalue) => {
		console.debug('Worker PID ' + process.pid + `: Completed job with id ${job.id}`, returnvalue);
	});

	worker.on('active', (job) => {
		console.debug('Worker PID ' + process.pid + `: Activated job with id ${job.id}`);
	});
	worker.on('error', (failedReason) => {
		console.error('Worker PID ' + process.pid + `: Job encountered an error`, failedReason);
	});	
}

console.log('Worker PID ' + process.pid + " is alive");
setUpWorker();