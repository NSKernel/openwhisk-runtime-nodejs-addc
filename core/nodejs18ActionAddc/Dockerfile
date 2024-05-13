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

# Build our modified BullMQ
#
RUN cd / && git clone https://github.com/NSKernel/bullmq-addc
RUN yarn global add npm-run-all
RUN cd /bullmq-addc && yarn install && yarn build

# Customize runtime with additional packages.
# Install package globally so user packages can override.
#
RUN cd / && \
    yarn install --production && \
    yarn cache clean --force

# Install Redis server locally
#
RUN wget http://download.redis.io/redis-stable.tar.gz && \
    tar xvzf redis-stable.tar.gz && \
    cd redis-stable && \
    make -j16 && \
    mv src/redis-server /usr/bin/ && \
    cd .. && \
    rm -r redis-stable && \
    npm install -g concurrently


EXPOSE 8080
EXPOSE 3011
EXPOSE 6379

CMD concurrently "/usr/bin/redis-server --bind '0.0.0.0'" "sleep 5s; node --expose-gc app.js" "sleep 5s; node --expose-gc worker.js"
