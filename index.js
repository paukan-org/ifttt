#!/usr/bin/env node

'use strict';

var core = require('paukan-core');
var async = require('async');
var Rpc = require('./lib/rpc');

var config = core.common.serviceConfig(require('./config.json'), require('./package.json'));

var service, rpc;
async.series([
    function createService(next) {
        service = new core.Service(config, next);
    },
    function injectRpc(next) {
        rpc = new Rpc(config.rpc, next);
    },
    function handleEvent(next) {
        var network = service.network, defaultEvent = 'state.'+service.id+'.service.data';
        rpc.on('data', function (title, description, categories, keywords) {
            var eventName = keywords && keywords.length ? keywords.join('.') : defaultEvent;
            var payload = categories && categories.length ? categories : [];
            if(title) { payload.push(title); }
            if(description) { payload.push(description); }
            payload.unshift(eventName);
            console.log('Emiting event %s', eventName);
            network.emit.apply(network, payload);
        });
        return next();
    }

], function(err) {
    if(err) { throw err; }
    console.log('IFFT service listening network requests on port %s, fake wordpress on port %s', service.cfg.port, config.rpc.listen);
});
