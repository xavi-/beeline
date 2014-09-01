var url = require("url");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var lru = require("lru-cache");

var getBuffer = (function() {
	var buffers = lru({ max: 1024 * 500, length: function(n) { return n.length; } });

	function watchBuffer(filePath) {
		if(buffers.has(filePath)) { return; }

		buffers.del(filePath);
		fs.watchFile(filePath, function() { buffers.del(filePath); });
	}

	return function getBuffer(filePath, callback) {
		if(buffers.has(filePath)) { return callback(null, buffers.get(filePath)); }

		fs.stat(filePath, function(err, stats) {
			if(err && err.code === "ENOENT") {
				return callback({ "file-not-found": true, path: filePath }, null);
			}

			if(err) { return callback(err, null); }

			if(!stats.isFile()) {
				return callback({ "not-a-file": true, path: filePath }, null);
			}

			fs.readFile(filePath, function(err, data) {
				if(err) { return callback(err, null); }

				watchBuffer(filePath);
				buffers.set(filePath, {
					data: data,
					sum: crypto.createHash("sha1").update(data).digest("hex")
				});
				callback(null, buffers.get(filePath));
			});
		});
	};
})();

function sendBuffer(req, res, mimeType, maxAge) {
	return function(err, buffer) {
		if(err) {
			if(err["file-not-found"]) {
				console.error("Could not find file: " + err.path);
				return default404(req, res);
			} else if(err["not-a-file"]) {
				console.error("Not a file: " + err.path);
				return default404(req, res);
			}

			throw err;
		}

		if(maxAge == null){
			maxAge = 31536000;
		}

		res.removeHeader("Set-Cookie");
		res.setHeader("Cache-Control", "private, max-age=" + maxAge);
		res.setHeader("ETag", buffer.sum);

		if(req.headers["if-none-match"] === buffer.sum) {
			res.writeHead(304);
			return res.end();
		} else {
			res.writeHead(
				res.statusCode || 200,
				{ "Content-Length": buffer.data.length, "Content-Type": mimeType }
			);
			return res.end(buffer.data, "binary");
		}
	};
}

var staticFile = (function() {
	function handler(filePath, mimeType, req, res, maxAge) {
		getBuffer(filePath, sendBuffer(req, res, mimeType, maxAge));
	}

	return function staticFile(filePath, mime, maxAge) {
		return function(req, res) { handler(filePath, mime, req, res, maxAge); };
	};
})();

function staticDir(rootDir, mimeLookup, maxAge) {
	for(var key in mimeLookup) {
		if(key.charAt(0) !== ".") {
			console.warn("Extension found without a leading periond ('.'): '" + key + "'");
		}
	}

	return function(req, res, extra, matches) {
		matches = matches || extra;
		var filePath = path.join.apply(path, [ rootDir ].concat(matches));
		var ext = path.extname(filePath).toLowerCase();

		if(!(ext in mimeLookup)) {
			console.error("Unknown file extension -- file: " + filePath + "; extension: " + ext);
			return default404(req, res);
		}

		if(path.relative(rootDir, filePath).indexOf("..") !== -1) {
			console.error(
				"Attempted access to parent directory -- root: " + rootDir + "; subdir: " + filePath
			);
			return default404(req, res);
		}

		getBuffer(filePath, sendBuffer(req, res, mimeLookup[ext], maxAge));
	};
}

function default404(req, res, next) {
	if(next) { return next(); }

	var body = "404'd";
	res.writeHead(404, { "Content-Length": body.length, "Content-Type": "text/plain" });
	res.end(body);

	console.log("Someone 404'd: " + req.url);
}
function default405(req, res, next) {
	if(next) { return next(); }

	var body = "405'd";
	res.writeHead(405, { "Content-Length": body.length, "Content-Type": "text/plain" });
	res.end(body);

	console.log("Someone 405'd -- url: " + req.url + "; verb: " + req.method);
}
function default500(req, res, err, next) {
	if(next) { return next(err); }

	console.error("Error accessing: " + req.method + " " + req.url);
	console.error(err.message);
	console.error(err.stack);

	var body = [ "500'd" ];
	body.push("An exception was thrown while accessing: " + req.method + " " + req.url);
	body.push("Exception: " + err.message);
	body = body.join("\n");
	res.writeHead(500, { "Content-Length": body.length, "Content-Type": "text/plain" });
	res.end(body);
}

function findPattern(patterns, urlPath) {
	for(var i = 0, l = patterns.length; i < l; i++) {
		if(patterns[i].regex.test(urlPath)) {
			return {
				handler: patterns[i].handler,
				extra: patterns[i].regex.exec(urlPath).slice(1)
			};
		}
	}

	return null;
}

function findGeneric(generics, req) {
	for(var i = 0, l = generics.length; i < l; i++) {
		if(generics[i].test(req)) { return generics[i].handler; }
	}

	return null;
}

var rRegExUrl = /^r`(.*)`$/, rToken = /`(.*?)(?:(?:\:\s*(.*?))|(\.\.\.)?)`/g;
function createTokenHandler(tokens, handler) {
	return function(req, res, oriVals, next) {
		var extra = Object.create(null);
		var newVals = new Array(tokens.length);
		for(var i = 0; i < tokens.length; i++) {
			var token = tokens[i];
			extra[token.name] = decodeURIComponent(oriVals[token.captureIdx]);
			newVals[i] = oriVals[token.captureIdx];
		}
		executeHandler(handler, this, req, res, { extra: extra, vals: newVals, next: next });
	};
}
var rHasFullCapture = /^\((?!\?[:!=]).*\)$/;
function processEmbeddedRegex(regex) {
	regex = regex.trim();
	var rTest = new RegExp("|" + regex);
	var numCaptures = rTest.exec("").length - 1;

	if(numCaptures <= 0) { return { regex: "(" + regex + ")", numCaptures: 1 }; }

	if(rHasFullCapture.test(regex)) { return { regex: regex, numCaptures: numCaptures }; }

	return { regex: "(" + regex + ")", numCaptures: numCaptures + 1 };
}
var rHasBackreference = /\\[1-9]/;
function parseToken(rule, handler) {
	var tokens = [], captureIdx = 0;
	var transform = rule.replace(rToken, function replaceToken(_, name, regex, isExtend) {
		if(!regex) {
			tokens.push({ name: name, captureIdx: captureIdx });
			captureIdx += 1;
		} else {
			var info = processEmbeddedRegex(regex);
			regex = info.regex;
			tokens.push({ name: name, captureIdx: captureIdx });
			captureIdx += info.numCaptures;
			if(rHasBackreference.test(regex)) {
				console.warn("Backreference are not supported -- url: " + rule);
			}
		}
		return regex || (isExtend ? "(.*?)" : "([^/]*?)");
	});
	var rRule = new RegExp("^" + transform + "$");
	return { regex: rRule, handler: createTokenHandler(tokens, handler) };
}


function executeHandler(handler, thisp, req, res, opts) {
	var override = req.headers && req.headers["x-http-method-override"];
	handler = (handler[override] || handler[req.method] || handler.any || handler);

	var extra = opts.extra, vals = opts.vals, next = opts.next;

	if(extra && vals) { req.params = extra; }

	if(next) {
		if(extra && vals) { handler.call(thisp, req, res, extra, vals, next); }
		else if(extra) { handler.call(thisp, req, res, extra, next); }
		else { handler.call(thisp, req, res, next); }
	} else {
		if(extra && vals) { handler.call(thisp, req, res, extra, vals); }
		else if(extra) { handler.call(thisp, req, res, extra); }
		else { handler.call(thisp, req, res); }
	}
}
function expandVerbs(handler) { // Expands "POST GET": handler to "POST": handler, "GET": handler
	if(handler.test) { // For `generic` type handlers
		handler.handler = expandVerbs(handler.handler);
		return handler;
	}

	for(var key in handler) {
		key.split(/\s+/).forEach(function(method) {
			handler[method] = handler[key];
		});
	}

	return handler;
}
var rWhitespace = /[\x20\t\r\n\f]/;
function splitRules(key) {
	var rules = [];
	var isQuoted = false, isPrevSpace = false;

	var  ruleIdx = 0, curIdx = 0;
	while(curIdx < key.length) {
		var chr = key.charAt(curIdx);

		if(chr === "`") { isQuoted = !isQuoted; curIdx += 1; continue; }
		if(isQuoted) { curIdx += 1; continue; }
		if(!rWhitespace.test(chr)) { curIdx += 1; continue; }

		rules.push(key.substring(ruleIdx, curIdx));
		do { // consume whitespace
			curIdx += 1;
			chr = key.charAt(curIdx);
		} while(curIdx < key.length && rWhitespace.test(chr));
		ruleIdx = curIdx;
	}

	if(isQuoted) { console.warn("Invalid beeline rule: " + key.substring(ruleIdx)); }
	else if(ruleIdx !== curIdx) { rules.push(key.substring(ruleIdx)); }

	return rules;
}
function route(routes) {
	var preprocess = [], urls = Object.create(null), patterns = [], generics = [];
	var missing = default404, missingVerb = default405, error = default500;

	function handler(req, res, next) {
		try {
			var urlPath = url.parse(req.url).pathname;
			var info = (
				urls[urlPath] ||
				findPattern(patterns, urlPath) ||
				findGeneric(generics, req) ||
				missing
			);
			var handler = info.handler || info;
			var extra = info.extra;

			preprocess.forEach(function(process) { process(req, res); });

			executeHandler(handler, this, req, res, { extra: extra, next: next });
		} catch(err) {
			error.call(this, req, res, err, next);
		}
	}
	handler.add = function(routes) {
		for(var key in routes) {
			var handler = routes[key];

			if(Object.prototype.toString.call(handler) === "[object Object]") {
				handler.any = handler.any || function() { missingVerb.apply(this, arguments); };
			}

			if(key === "`preprocess`") {
				if(!Array.isArray(handler)) { preprocess.push(handler); }
				else { Array.prototype.push.apply(preprocess, handler); }
				continue;
			}

			splitRules(key).forEach(function(rule) {
				if(rule.indexOf("`") === -1) {
					if(rule in urls) { console.warn("Duplicate beeline rule: " + rule); }
					if(rule.charAt(0) !== "/") {
						console.warn("Url doesn't have leading slash (/): " + rule);
					}
					urls[rule] = expandVerbs(handler);
				} else if(rule === "`404`" || rule === "`missing`" || rule === "`default`") {
					if(missing !== default404) { console.warn("Duplicate beeline rule: " + rule); }
					missing = expandVerbs(handler);
				} else if(
					rule === "`405`" || rule === "`missing-verb`" || rule === "`missingVerb`"
				) {
					if(missingVerb !== default405) {
						console.warn("Duplicate beeline rule: " + rule);
					}
					missingVerb = expandVerbs(handler);
				} else if(rule === "`500`" || rule === "`error`") {
					if(error !== default500) { console.warn("Duplicate beeline rule: " + rule); }
					error = expandVerbs(handler);
				} else if(rule === "`generics`") {
					Array.prototype.push.apply(generics, handler.map(expandVerbs));
				} else if(rRegExUrl.test(rule)) {
					var rRule = new RegExp(rRegExUrl.exec(rule)[1]);
					var cmpRegEx = function(p) { return p.regex.toString() === rRule.toString(); };
					if(patterns.some(cmpRegEx)) {
						console.warn("Duplicate beeline rule: " + rule);
					}
					patterns.push({ regex: rRule, handler: expandVerbs(handler) });
				} else if(rToken.test(rule)) {
					var pattern = parseToken(rule, expandVerbs(handler));
					var cmpPattern = function(p) {
						return p.regex.toString() === pattern.regex.toString();
					};
					if(patterns.some(cmpPattern)) {
						console.warn("Duplicate beeline rule: " + rule);
					}
					patterns.push(pattern);
				} else {
					console.warn("Invalid beeline rule: " + rule);
				}
			});
		}
	};
	handler.missing = function(req, res, thisp) {
		missing.call(thisp, req, res);
	};
	handler.missingVerb = function(req, res, thisp) {
		missingVerb.call(thisp, req, res);
	};
	handler.error = function(req, res, err, thisp) {
		error.call(thisp, req, res, err);
	};
	handler.add(routes);

	return handler;
}

exports.route = route;
exports.staticFile = staticFile;
exports.staticDir = staticDir;