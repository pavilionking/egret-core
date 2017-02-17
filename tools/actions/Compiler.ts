import utils = require('../lib/utils');
import file = require('../lib/FileUtil');
import ts = require("../lib/typescript-plus/lib/typescript");
import * as path from 'path';

interface CompileOption {
    args: egret.ToolArgs;
    files?: string[];
    out?: string;
    outDir?: string;
    def?: boolean;
    forSortFile?: boolean;
    debug?: boolean;
}

export interface EgretCompilerHost {
    program: ts.Program;
    files?: string[];
    exitStatus: number;
    compileWithChanges?: (filesChanged: egret.FileChanges, sourceMap?: boolean) => EgretCompilerHost;
    messages?: string[];
}

export class Compiler {

    private sortedFiles: string[];
    private program: ts.Program;
    private options: ts.CompilerOptions;

    public compile(options: ts.CompilerOptions, rootFileNames: string[]): EgretCompilerHost {
        this.fileNames = rootFileNames;
        this.options = options;

        this.program = ts.createProgram(rootFileNames, options);
        this.sortFiles();
        let emitResult = this.program.emit();
        this.logErrors(emitResult.diagnostics);
        return { files: this.sortedFiles, program: this.program, exitStatus: 0, messages: this.errors, compileWithChanges: this.compileWithChanges.bind(this) };
    }

    private sortFiles(): void {
        let program = this.program;
        let sortResult = ts.reorderSourceFiles(program);
        if (sortResult.circularReferences.length > 0) {
            let error: string = "";
            error += "error: circular references '" + "' :" + ts.sys.newLine;
            error += "    at " + sortResult.circularReferences.join(ts.sys.newLine + "    at ") + ts.sys.newLine + "    at ...";
            console.log(error);
            this.errors.push(error);
        }
        this.sortedFiles = sortResult.sortedFileNames;
    }

    private errors: string[] = [];

    private logErrors(diagnostics) {
        let allDiagnostics = ts.getPreEmitDiagnostics(this.program).concat(diagnostics);

        allDiagnostics.forEach(diagnostic => {
            let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
            let msg;
            if (diagnostic.file) {
                let {line, character} = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
                msg = `  Error ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
            }
            else {
                msg = `  Error: ${message}`;
            }
            console.log(msg);
            this.errors.push(msg);
        });
    }

    private fileNames: Array<string>;

    private compileWithChanges(filesChanged: egret.FileChanges, sourceMap?: boolean): EgretCompilerHost {
        this.errors = [];
        filesChanged.forEach(file => {
            if (file.type == "added") {
                this.fileNames.push(file.fileName);
            }
            else if (file.type == "removed") {
                var index = this.fileNames.indexOf(file.fileName);
                if (index >= 0) {
                    this.fileNames.splice(index, 1);
                }
            }
            else {
            }
        });

        return this.compile(this.options, this.fileNames);
    }

    parseTsconfig() {
        let url = egret.args.projectDir + "tsconfig.json";
        let options = egret.args;
        var configObj: any;
        try {
            configObj = JSON.parse(file.read(url));
        } catch (e) {
            // errLog.push(utils.tr(1117));//不是有效的 json 文件
            configObj = {
                "compilerOptions": {
                    "target": "es5",
                    "experimentalDecorators": true,
                    "lib": [
                        "es5", "dom", "es2015.promise"
                    ]
                },
                "exclude": [
                    "node_modules"
                ]
            }
        }

        let notSupport = ["module", "noLib", "outFile", "rootDir", "out"];
        let defaultSupport = { target: "es5", outDir: "bin-debug" };
        let compilerOptions = configObj.compilerOptions;
        for (let optionName of notSupport) {
            if (compilerOptions.hasOwnProperty(optionName)) {
                var error = utils.tr(1116, optionName);//这个编译选项目前不支持修改
                console.log(error);//build -e 的时候输出
                delete compilerOptions[optionName];
            }
        }
        for (let optionName in defaultSupport) {
            if (compilerOptions[optionName] != defaultSupport[optionName]) {
                if (compilerOptions[optionName]) {
                    var error = utils.tr(1116, optionName);
                    console.log(`${error} 将被调整为'${defaultSupport[optionName]}'`)
                }
                compilerOptions[optionName] = defaultSupport[optionName];
            }
        }

        var configParseResult = ts.parseJsonConfigFileContent(configObj, ts.sys, path.dirname(url));
        compilerOptions = configParseResult.options;
        compilerOptions.defines = getCompilerDefines(options);

        return configParseResult
    }
}

function getCompilerDefines(args: egret.ToolArgs, debug?: boolean) {
    let defines: any = {};
    if (debug != undefined) {
        defines.DEBUG = debug;
        defines.RELEASE = !debug;
    }
    else if (args.publish) {
        defines.DEBUG = false;
        defines.RELEASE = true;
    }
    else {
        defines.DEBUG = true;
        defines.RELEASE = false;
    }
    return defines;

}