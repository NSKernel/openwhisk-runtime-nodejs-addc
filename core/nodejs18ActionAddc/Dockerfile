#
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

FROM node:18.20.2-bullseye

# Initial update and some basics.
#
RUN apt-get update && apt-get install -y \
    imagemagick \
    graphicsmagick \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Add sources and copy the package.json to root container,
# so npm packages from user functions take precedence.
#
WORKDIR /nodejsAction
ADD  . /nodejsAction/
COPY package.json /
# COPY ../../bullmq-addc /

# Build Everything
#
RUN cd / && git clone --depth=1 https://github.com/NSKernel/bullmq-addc && \
    yarn global add npm-run-all && cd /bullmq-addc && yarn install && yarn build && \
    cd / && \
    yarn install --production && \
    yarn cache clean --force && \
    npm install -g node-gyp && \
    cd /nodejsAction/addc-addon && node-gyp configure && node-gyp build && \
    wget http://download.redis.io/redis-stable.tar.gz && \
    tar xvzf redis-stable.tar.gz && \
    rm redis-stable.tar.gz && \
    cd redis-stable && \
    make -j16 && \
    mv src/redis-server /usr/bin/ && \
    cd .. && \
    rm -r redis-stable && \
    npm install -g concurrently && \
    npm prune --production && \
    rm -rf /bullmq-addc && \
    cd /node_modules/bullmq-addc && echo before && du -sh . && yarn install --production && echo after && du -sh . && \
    yarn cache clean && \
    apt remove --purge -y gcc g++-10 libstdc++-10-dev gcc-10 && \
    apt autoremove -y && \
    chmod +x /nodejsAction/run.sh

EXPOSE 8080
EXPOSE 3011
EXPOSE 6379

# CMD /bin/bash /nodejsAction/run.sh
CMD concurrently "/usr/bin/redis-server --bind '0.0.0.0'" "sleep 5s; node --expose-gc app.js" "sleep 5s; node --expose-gc worker_normal.js" "sleep 5s; node --expose-gc worker.js" "sleep 5s; node --expose-gc worker.js" "sleep 5s; node --expose-gc worker.js"
