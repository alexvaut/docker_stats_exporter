#!/usr/bin/env node
'use strict';

// Requirements
const http = require('http');
const prom = require('prom-client');
const Docker = require('dockerode');
const commandLineArgs = require('command-line-args')
const util = require('util')
const timestamp = require("timestamp-nano");

// Constants
const appName = 'dockerstats';

// Get args and set options
const argOptions = commandLineArgs([
    { name: 'port', alias: 'p', type: Number, defaultValue: process.env.DOCKERSTATS_PORT || 9487, },
    { name: 'interval', alias: 'i', type: Number, defaultValue: process.env.DOCKERSTATS_INTERVAL || 15, },
    { name: 'hostip', type: String, defaultValue: process.env.DOCKERSTATS_HOSTIP || '', },
    { name: 'hostport', type: Number, defaultValue: process.env.DOCKERSTATS_HOSTPORT || 0, },
    { name: 'collectdefault', type: Boolean, },
]);
const port = argOptions.port;
const interval = argOptions.interval >= 3 ? argOptions.interval : 3;
const dockerIP = argOptions.hostip;
const dockerPort = argOptions.hostport;
const collectDefaultMetrics = process.env.DOCKERSTATS_DEFAULTMETRICS || argOptions.collectdefault;

// Connect to docker
let dockerOptions;
if (dockerIP && dockerPort) {
    dockerOptions = { host: dockerIP, port: dockerPort, socketPath: null };
    console.log(`INFO: Connecting to Docker on ${dockerIP}:${dockerPort}...`);
} else {
    dockerOptions = { socketPath: '/var/run/docker.sock' };
    console.log(`INFO: Connecting to Docker on /var/run/docker.sock...`);    
}
const docker = new Docker(dockerOptions);
if (!docker) {
    console.log(`ERROR: Unable to connect to Docker`);
    process.exit(1);
}


let counterCpuUsageTotalSeconds;
let counterCpuKernelTotalSeconds;
let gaugeCpuLimitQuota;
let gaugeMemoryUsageBytes;
let gaugeMemoryWorkingSetBytes;
let gaugeMemoryLimitBytes;
let counterNetworkReceivedBytes;
let counterNetworkReceivedErrors;
let counterNetworkReceivedDropped;
let counterNetworkReceivedPackets;
let counterNetworkSentBytes;
let counterNetworkSentErrors;
let counterNetworkSentDropped;
let counterNetworkSentPackets;
let counterFsReadBytes;
let counterFsReads;
let counterFsWriteBytes;
let counterFsWrites;

setup();

let isWindows = false;
let previousState = {};
let results = [];
let labelNames = [];

function normalizeLabel(label)
{
    return "container_label_" + label.replace(/\./g,"_");
}

async function setup()
{
    let version = await docker.version();
    isWindows = version.Os == "windows";
    console.log(`INFO: Windows OS = ${isWindows}`);

    await gatherMetrics();

    labelNames = new Set();
    for (let result of results) {            
        if (!result['cpu_stats']) 
        {
            Object.keys(result['Config']['Labels']).map(function(label){                 
                labelNames.add(normalizeLabel(label))
            });
        }
    }

    labelNames.add('id');
    labelNames.add('image');
    labelNames.add('name');

    labelNames = Array.from(labelNames);
    let netLabelNames = Array.from(labelNames);
    netLabelNames.push('interface');

    // Initialize prometheus metrics.
    counterCpuUsageTotalSeconds = new prom.Counter({
        'name': 'container_cpu_usage_seconds_total',
        'help': 'Cumulative cpu time consumed in seconds.',
        'labelNames': labelNames,
    });
    
    counterCpuKernelTotalSeconds = new prom.Counter({
        'name': 'container_cpu_system_seconds_total',
        'help': 'Cumulative system cpu time consumed in seconds.',
        'labelNames': labelNames,
    });
    
    gaugeCpuLimitQuota = new prom.Gauge({
        'name': 'container_spec_cpu_quota',
        'help': 'CPU quota of the container.',
        'labelNames': labelNames,
    });
    
    gaugeMemoryUsageBytes = new prom.Gauge({
        'name': 'container_memory_usage_bytes',
        'help': 'Current memory usage in bytes, including all memory regardless of when it was accessed.',
        'labelNames': labelNames,
    });
    
    gaugeMemoryWorkingSetBytes = new prom.Gauge({
        'name': 'container_memory_working_set_bytes',
        'help': 'Current working set in bytes.',
        'labelNames': labelNames,
    });
    
    gaugeMemoryLimitBytes = new prom.Gauge({
        'name': 'container_spec_memory_limit_bytes',
        'help': 'Memory limit for the container.',
        'labelNames': labelNames,
    });
    
    counterNetworkReceivedBytes = new prom.Counter({
        'name': 'container_network_receive_bytes_total',
        'help': 'Cumulative count of bytes received.',
        'labelNames': netLabelNames,
    });
    
    counterNetworkReceivedErrors = new prom.Counter({
        'name': 'container_network_receive_errors_total',
        'help': 'Cumulative count of errors encountered while receiving.',
        'labelNames': netLabelNames,
    });
    
    counterNetworkReceivedDropped = new prom.Counter({
        'name': 'container_network_receive_packets_dropped_total',
        'help': 'Cumulative count of packets dropped while receiving.',
        'labelNames': netLabelNames,
    });
    
    counterNetworkReceivedPackets = new prom.Counter({
        'name': 'container_network_receive_packets_total',
        'help': 'Cumulative count of packets received.',
        'labelNames': netLabelNames,
    });
    
    counterNetworkSentBytes = new prom.Counter({
        'name': 'container_network_transmit_bytes_total',
        'help': 'Cumulative count of bytes transmitted.',
        'labelNames': netLabelNames,
    });
    
    counterNetworkSentErrors = new prom.Counter({
        'name': 'container_network_transmit_errors_total',
        'help': 'Cumulative count of errors encountered while transmitting.',
        'labelNames': netLabelNames,
    });
    
    counterNetworkSentDropped = new prom.Counter({
        'name': 'container_network_transmit_packets_dropped_total',
        'help': 'Cumulative count of packets dropped while transmitting.',
        'labelNames': netLabelNames,
    });
    
    counterNetworkSentPackets = new prom.Counter({
        'name': 'container_network_transmit_packets_total',
        'help': 'Cumulative count of packets transmitted.',
        'labelNames': netLabelNames,
    });
    
    counterFsReadBytes = new prom.Counter({
        'name': 'container_fs_reads_bytes_total',
        'help': 'Cumulative count of bytes read.',
        'labelNames': labelNames,
    });
    
    counterFsReads = new prom.Counter({
        'name': 'container_fs_reads_total',
        'help': 'Cumulative count of reads completed.',
        'labelNames': labelNames,
    });
    
    counterFsWriteBytes = new prom.Counter({
        'name': 'container_fs_writes_bytes_total',
        'help': 'Cumulative count of bytes written.',
        'labelNames': labelNames,
    });
    
    counterFsWrites = new prom.Counter({
        'name': 'container_fs_writes_total',
        'help': 'Cumulative count of writes completed.',
        'labelNames': labelNames,
    });

    // Register all metrics
    console.log(`INFO: Registering Prometheus metrics...`);
    const register = new prom.Registry();
    register.registerMetric(counterCpuUsageTotalSeconds);
    register.registerMetric(counterCpuKernelTotalSeconds);
    register.registerMetric(gaugeCpuLimitQuota);

    register.registerMetric(gaugeMemoryUsageBytes);
    register.registerMetric(gaugeMemoryWorkingSetBytes);
    register.registerMetric(gaugeMemoryLimitBytes);

    register.registerMetric(counterNetworkReceivedBytes);
    register.registerMetric(counterNetworkReceivedErrors);
    register.registerMetric(counterNetworkReceivedDropped);
    register.registerMetric(counterNetworkReceivedPackets);
    register.registerMetric(counterNetworkSentBytes);
    register.registerMetric(counterNetworkSentErrors);
    register.registerMetric(counterNetworkSentDropped);
    register.registerMetric(counterNetworkSentPackets);

    register.registerMetric(counterFsReadBytes);
    register.registerMetric(counterFsReads);
    register.registerMetric(counterFsWriteBytes);
    register.registerMetric(counterFsWrites);

    if (collectDefaultMetrics) {
        prom.collectDefaultMetrics({
            timeout: 5000,
            register: register,        
        });
    }
    

    // Start gathering metrics    
    setInterval(gatherMetrics, interval * 1000);

    // Start Server.
    console.log(`INFO: Starting HTTP server...`);
    const server = http.createServer((req, res) => {
        // Only allowed to poll prometheus metrics.
        if (req.method !== 'GET') {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            return res.end('Support GET only');
        }
        res.setHeader('Content-Type', register.contentType);
        res.end(register.metrics());
    }).listen(port);
    server.setTimeout(20000);
    console.log(`INFO: Docker Stats exporter listening on port ${port}`);
}


// Main function to get the metrics for each container
async function gatherMetrics() {
    try {
        // Get all containers
        let containers = await docker.listContainers();
        if (!containers || !Array.isArray(containers) || !containers.length) {
            throw new Error('ERROR: Unable to get containers');
        }

        // console.debug(`containers.length =  ${containers.length}`);
        
        // Get stats for each container in one go
        let promises = [];
        for (let container of containers) {
            if (container.Id) {
                promises.push(docker.getContainer(container.Id).inspect({ 'stream': false, 'decode': true }));
                promises.push(docker.getContainer(container.Id).stats({ 'stream': false, 'decode': true }));
            }
        }
        results = await Promise.all(promises);
        let info;

        // Build metrics for each container
        for (let result of results) {            
            if (!result['cpu_stats']) 
            {
                info = result;
                continue;
            }

            // console.debug(`name =  ${result['name']}`);

            if(isWindows)
            {
                let id = result['id'];
               
                if(previousState[id])
                {
                    let pResult = previousState[id];

                    //setup labels
                    const labels = {
                        'name': result['name'],
                        'id': '/docker/' + result['id'],
                        'image': info['Config']['Image'],
                    };
                    
                    Object.keys(info['Config']['Labels']).map(function(label){
                        let nLabel = normalizeLabel(label);
                        if(labelNames.includes(nLabel))
                        {
                            labels[nLabel] = info['Config']['Labels'][label];
                        }
                    });

                    // CPU - stats
                    if (result['cpu_stats'] && result['cpu_stats']['cpu_usage']) {
                        let delta_usage_seconds = (result['cpu_stats']['cpu_usage']['total_usage'] - pResult['cpu_stats']['cpu_usage']['total_usage']) / 10000000;
                        counterCpuUsageTotalSeconds.inc(labels, delta_usage_seconds);                        

                        let delta_kernel_seconds = (result['cpu_stats']['cpu_usage']['usage_in_kernelmode'] - pResult['cpu_stats']['cpu_usage']['usage_in_kernelmode']) / 10000000;
                        counterCpuKernelTotalSeconds.inc(labels, delta_kernel_seconds);         
                    }

                    // CPU - limits
                    if(info['HostConfig'] && info['HostConfig']['NanoCpus'] && info['HostConfig']['NanoCpus'] > 0) {
                        let cpuLimit = info['HostConfig']['NanoCpus'] / 10000;
                        gaugeCpuLimitQuota.set(labels, cpuLimit);                        
                    }

                    // Memory - stats
                    if (result['memory_stats'] && result['memory_stats']['privateworkingset']) {                        
                        let memUsage = result['memory_stats']['commitbytes'];                        
                        gaugeMemoryUsageBytes.set(labels, memUsage);                        

                        let workingSet = result['memory_stats']['privateworkingset'];
                        gaugeMemoryWorkingSetBytes.set(labels, workingSet);                        
                    }
                    
                    // Memory - limits
                    if(info['HostConfig'] && info['HostConfig']['Memory'] && info['HostConfig']['Memory'] > 0) {
                        let memLimit = info['HostConfig']['Memory'];
                        gaugeMemoryLimitBytes.set(labels, memLimit);                        

                        gaugeMemoryLimitBytes.la
                    }

                    let dispatch = function(map,newS, oldS)
                    {
                        for (const metric of Object.keys(newS)) {                                 
                            let value = newS[metric] - oldS[metric];
                            if(map[metric]) map[metric].inc(labels, value);
                        }
                    }

                    //I/O
                    if (result['storage_stats']) {    
                        
                        let map = {
                            "read_size_bytes": counterFsReadBytes,
                            "read_count_normalized": counterFsReads,
                            "write_size_bytes": counterFsWriteBytes,
                            "write_count_normalized": counterFsWrites,
                        };

                        dispatch(map,result['storage_stats'],pResult['storage_stats']);
                    }

                    //Networks
                    let networkNames = Object.keys(info['NetworkSettings']['Networks']);
                    if (result['networks']) {
                        let keys = Object.keys(result['networks']);
                        var i;
                        for (i = 0; i < keys.length ; i++) {                               
                            labels["interface"] = networkNames[i];
                            let network = keys[i];

                            let map = {
                                "rx_bytes": counterNetworkReceivedBytes,
                                "rx_errors": counterNetworkReceivedErrors,
                                "rx_dropped": counterNetworkReceivedDropped,
                                "rx_packets": counterNetworkReceivedPackets,
                                "tx_bytes": counterNetworkSentBytes,
                                "tx_errors": counterNetworkSentErrors,
                                "tx_dropped": counterNetworkSentDropped,
                                "tx_packets": counterNetworkSentPackets
                            };

                            dispatch(map,result['networks'][network],pResult['networks'][network]);
                        }
                    }

                }

                previousState[id] = result;
            }
          else
            {
                console.log('ERROR: not supported yet, use cadvisor');                
            }
        }
    } catch (err) {
        console.log('ERROR: ' + err);
    }
}