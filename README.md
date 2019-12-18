# Windows Docker Stats exporter

This repo is obsolete, check https://github.com/alexvaut/cStatsExporter instead.

## Reason
Because of this issue: https://github.com/docker/for-win/issues/1976 a workaround was added to find the host ip. The workaround is writng the host file according to the output of ipconfig. On a deployment with docker or docker-compose it works fine. However, with docker swarm or when a multi instances network is used, it doesn't since the gateway is not the host....

Windows Docker Stats exporter for Prometheus.io. Compatible with cadvisor metrics !

It's a fork of https://github.com/wywywywy/docker_stats_exporter where the support for linux has been replaced by the support of windows . Cadvisor is doing a good enough job on linux while on windows there isn't anything.

It is exposing a subset of the cadvisor metrics depending on what is available on a windows host:
- container_cpu_usage_seconds_total
- container_cpu_system_seconds_total
- container_spec_cpu_quota
- container_memory_usage_bytes
- container_memory_working_set_bytes
- container_spec_memory_limit_bytes
- container_network_receive_bytes_total
- container_network_receive_errors_total
- container_network_receive_packets_dropped_total
- container_network_receive_packets_total
- container_network_transmit_bytes_total
- container_network_transmit_errors_total
- container_network_transmit_packets_dropped_total
- container_network_transmit_packets_total
- container_fs_reads_bytes_total
- container_fs_reads_total
- container_fs_writes_bytes_total
- container_fs_writes_total

## Usage

### Arguments

    --port     9487         Exporter listens on this port (default = 9487)
    --interval 15           Polling interval in seconds (default = 15, minimum 3)
    --hostip   127.0.0.1    Docker engine IP to connect to (when using HTTP)
    --hostport 2375         Docker engine port to connect to (when using HTTP)
    --collectdefault        Collect default Prometheus metrics as well (default = false)

If no `hostip` and `hostport` provided, it defaults to connect via socket to `/var/run/docker.sock`.

## Environment Variables

The arguments can also be set as env variables instead. Useful if you're using it in a Docker container.
1. DOCKERSTATS_PORT
2. DOCKERSTATS_INTERVAL
3. DOCKERSTATS_HOSTIP
4. DOCKERSTATS_HOSTPORT
5. DOCKERSTATS_DEFAULTMETRICS

## Installation

### From Source

Node 10 is required to run it. It uses [Apocas's Dockerode library](https://github.com/apocas/dockerode).

    git clone git@github.com:alexvaut/docker_stats_exporter.git
    cd docker_stats_exporter
    npm install
    npm start

Recommend npm version >= 6, as version 5 seems to have problems installing Dockerode.

### With Docker

    docker run -d --restart=always -p 9487:9487 alexvaut/docker_stats_exporter:latest

### Prometheus Config

Add this to prometheus.yml and change the IP/port if needed.

    - job_name: 'docker_stats_exporter'
        metrics_path: /
        static_configs:
        - targets:
            - 'windowsHost:9487'
            
## License

This is licensed under the Apache License 2.0.
