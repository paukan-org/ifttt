#!/usr/bin/env node

// based on http://codex.wordpress.org/XML-RPC_MetaWeblog_API

'use strict';

var express = require('express');
var xmlparser = require('express-xml-bodyparser');
var ld = require('lodash-node');
var events = require('eventemitter2');
var util = require('util');

function Rpc(config, callback) {

    var app = this.app = express(),
        self = this;

    events.EventEmitter2.call(this);
    this.config = config;

    callback = callback || function(err) {
        if(err) {
            throw err;
        }
        console.info('Wordpress emulation service is listening on port %s', config.port);
        self.emit('ready');
    };

    app.use(xmlparser({
        ignoreAttrs: true,
        mergeAttrs: true,
        explicitArray: false,
    }));

    // redirect to documentation
    app.get(['/', '/wp-admin*'], function(req, res) {
        res.redirect(config.homepage);
    });

    // handle incoming requests
    app.post('/xmlrpc.php', this.handleRequest.bind(this));

    app.listen(config.listen, callback);

}
util.inherits(Rpc, events.EventEmitter2);

Rpc.prototype.createSuccessXml = function(innerXml) {
    return '<?xml version="1.0"?>' +
        '<methodResponse>' +
        '<params>' +
        '<param>' +
        '<value>' +
        innerXml +
        '</value>' +
        '</param>' +
        '</params>' +
        '</methodResponse>';
};

Rpc.prototype.createFailureXml = function(status, message) {
    return '<?xml version="1.0"?>' +
        '<methodResponse>' +
        '<fault>' +
        '<value>' +
        '<struct>' +
        '<member>' +
        '<name>faultCode</name>' +
        '<value><int>' + status + '</int></value>' +
        '</member>' +
        '<member>' +
        '<name>faultString</name>' +
        '<value><string>' + (message || 'Request was not successful.') + '</string></value>' +
        '</member>' +
        '</struct>' +
        '</value>' +
        '</fault>' +
        '</methodResponse>';
};

Rpc.prototype.handleRequest = function(req, res) {
    var _xml = req.body,
        call = _xml.methodCall,
        xml, self = this,
        config = this.config;

    switch(call.methodName) {

        // list of supported calls
        case 'mt.supportedMethods':
            xml = self.createSuccessXml('metaWeblog.getRecentPosts');
            break;

            // emulate wordpress answer
        case 'metaWeblog.getRecentPosts':
        case 'metaWeblog.getCategories':
            xml = self.createSuccessXml('<array><data></data></array>');
            break;

            // payload will be exucuted in '.newPost' method
        case 'metaWeblog.newPost':
            var params = call.params && call.params.param || [];
            var user = params[1] && params[1].value.string;
            var password = params[2] && params[2].value.string;

            // wrong username or password
            if(config.user !== user || config.password !== password) {
                xml = self.createFailureXml(401, 'Wrong credentials.');
                console.error('Wrong credentials');
                break;
            }

            // extract data from request to object 'data':
            // .title, .description - string fields
            // .categories - array of categories
            // .mt_keywords - array of events which should be fired
            var data = {};
            ld.each(params[3] && params[3].value.struct.member, function(v) {
                var item, value = v.value;
                if(value.string) {
                    item = value.string;
                } else if(value.array) {
                    var arr = value.array.data.value;
                    item = ld.map(ld.isArray(arr) ? arr : [arr], function(v2) {
                        return v2.string;
                    });
                }
                if(item) {
                    data[v.name] = item;
                }
            });

            xml = self.createSuccessXml('<string>Success.</string>');

            // send event about incoming data
            self.emit(
                'data',
                data.title && data.title.trim(),
                data.description && data.description.trim(),
                data.categories,
                data.mt_keywords
            );
            break;
        default:
            xml = self.createFailureXml(404, 'Method name not supported.');
    }

    res.set('Connection: close');
    res.set('Connection-Length: ', xml.length || 0);
    res.set('Content-Type', 'text/xml');
    res.end(xml);
};


module.exports = Rpc;
