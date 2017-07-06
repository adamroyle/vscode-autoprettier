var vscode = require('vscode');
var path = require('path');
var fs = require('fs');
var minimatch = require('minimatch');
var parseShell = require('shell-quote').parse;
var quoteShell = require('shell-quote').quote;
var child_process = require('child_process');

function activate(context) {
	vscode.workspace.onDidSaveTextDocument(document => {
		on_post_save_async(document.fileName);
	});
}

let start = null;
const node_path = '/usr/local/bin/node';
const all_packages = {};

function on_post_save_async(fileName) {
	start = Date.now();

	const packages = get_packages(fileName);

	outer_loop: for (let i = 0; i < packages.length; i++) {
		const config = get_package(packages[i]);
		if (!config) {
			continue;
		}
		const relativeFilename = fileName.replace(config.root + '/', '');
		for (let j = 0; j < config.commands.length; j++) {
			const cmd = config.commands[j];
			if (minimatch(relativeFilename, cmd.glob)) {
				run_prettier(fileName, cmd.options, config.prettier_path);
				break outer_loop;
			}
		}
	}

	console.log(Date.now() - start);
}

function run_prettier(fileName, options, prettier_path) {
	const cmd = quoteShell([node_path, prettier_path].concat(options).concat(['--write', fileName]));
	console.log('run prettier');
	console.log(cmd);
	child_process.exec(cmd);
}

function get_packages(fileName) {
	const packages = [];
	let folder = path.dirname(fileName);
	while (folder != '/') {
		package = folder + '/package.json';
		if (fs.existsSync(package)) {
			packages.push(package);
		}
		folder = path.dirname(folder);
	}
	return packages;
}

function get_package(packagePath) {
	const mtime = fs.statSync(packagePath).mtime.valueOf();

	let config = all_packages[packagePath];

	if (!config || config.mtime !== mtime) {
		config = parse_package(packagePath);
		config.mtime = mtime;
		all_packages[packagePath] = config;
	}

	return config;
}

function parse_package(packagePath) {
	let jsonData;

	try {
		jsonData = JSON.parse(fs.readFileSync(packagePath));
	} catch (e) {
		console.log('could not read json', packagePath);
		return;
	}

	const scripts = jsonData.scripts || {};
	const cmds = [];
	const root = path.dirname(packagePath);

	for (let key in scripts) {
		const script = scripts[key];
		const script_parts = parseShell(script);

		let options = [];
		let mode = 'LOOKING_FOR_PRETTIER';

		script_parts.forEach((v, i) => {
			if (mode == 'LOOKING_FOR_PRETTIER') {
				if (v == 'prettier') {
					mode = 'PARSING_OPTIONS';
					options = [];
				}
			} else if (mode == 'PARSING_OPTIONS') {
				if (typeof v !== 'string') {
					cmds.push({ options: options, glob: options.pop() });
					mode = 'LOOKING_FOR_PRETTIER';
				} else if (script_parts.length == i + 1) {
					cmds.push({ options: options, glob: v });
				} else if (v != '--write') {
					options.push(v);
				}
			}
		});
	}

	return {
		prettier_path: root + '/node_modules/.bin/prettier',
		root: root,
		commands: cmds,
	};
}

exports.activate = activate;

function deactivate() {}

exports.deactivate = deactivate;
