#!/bin/bash

_term() { 
  echo "Caught SIGTERM signal!" 
  kill -TERM "$redis_server_pid" 2>/dev/null
  kill -TERM "$app_pid" 2>/dev/null
  kill -TERM "$worker_1_pid" 2>/dev/null
  kill -TERM "$worker_2_pid" 2>/dev/null
  kill -TERM "$worker_3_pid" 2>/dev/null
  kill -TERM "$worker_4_pid" 2>/dev/null
}

trap _term SIGTERM
trap _term SIGINT

echo "Initialising...";
/usr/bin/redis-server --bind '0.0.0.0' &
redis_server_pid=$!
sleep 2s; node --expose-gc app.js &
app_pid=$!
sleep 5s; node --expose-gc worker_normal.js &
worker_1_pid=$!
sleep 5s; node --expose-gc worker.js &
worker_2_pid=$!
sleep 5s; node --expose-gc worker.js &
worker_3_pid=$!
sleep 5s; node --expose-gc worker.js
worker_4_pid=$!

wait "$redis_server_pid"
wait "$app_pid"
wait "$worker_1_pid"
wait "$worker_2_pid"
wait "$worker_3_pid"
wait "$worker_4_pid"