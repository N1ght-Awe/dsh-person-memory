// Tests and the demo deliberately have no access to a host or messaging gateway.
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';
import { syncBuiltinESMExports } from 'node:module';
const deny = () => { throw Error('Network disabled in the synthetic test/demo harness'); };
globalThis.fetch = deny;
globalThis.WebSocket = class { constructor() { deny(); } };
http.request = http.get = https.request = https.get = deny;
net.connect = net.createConnection = tls.connect = deny;
net.Socket.prototype.connect = deny;
dgram.createSocket = deny;
syncBuiltinESMExports();

