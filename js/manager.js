const logger = require('./logger').logger;
const { exec } = require('child_process');
const {dialog} = require('electron');
const rimraf = require('rimraf');
const toml = require('./toml');
const path = require('path');
const os =  require('os');
const fs = require('fs');

function createSubdirectoriesIfNotExist(dirPath) {
    const subdirectories = path.parse(dirPath).dir.split(path.sep);

    subdirectories.shift();

    subdirectories.reduce((currentPath, subdirectory) => {
        currentPath = path.join(currentPath, subdirectory);

        if (!fs.existsSync(currentPath)) {
            fs.mkdirSync(currentPath);
        }

        return currentPath;
    }, path.isAbsolute(dirPath) ? path.sep : '');
}


function deleteEmptyDirectorys(filePath, originalPath) {
    const parentDir = path.dirname(filePath);
  
    try {
        const files = fs.readdirSync(parentDir);
    
        if (files.length === 0) {
            logger.info(`Removing ${originalPath.substring(0, originalPath.lastIndexOf('/'))}`);
            rimraf.sync(parentDir);
            //logger.info(`Successfully removed ${originalPath.substring(0, originalPath.lastIndexOf('/'))}`)
        }
    } catch (err) {
        logger.error(`Error checking/deleting parent directory: ${err.message}`);
    }
}
  

function fixGame(settings, AppData) {
    try {
        const tmpPath = path.join(AppData, "/tmp");
        const fixPath = path.join(tmpPath, "fix.toml");

        if (!fs.existsSync(tmpPath)) {
            fs.mkdirSync(tmpPath);
        }

        if (!fs.existsSync(fixPath)) {
            fs.writeFileSync(fixPath, "");
        }

        const fix = toml.parse(fs.readFileSync(fixPath).toString());
        const assets = fix.assets;
        const msm_dir = settings.msm_directory

        if (assets) {
            assets.forEach(items => {
                try {
                    const filePath = path.join(tmpPath, items[0])
                    const msmFilePath = path.join(msm_dir, "data", items[1])

                    if(fs.existsSync(filePath)){
                        logger.info(`Fixing ${items[1]}`);

                        const newBuffer = fs.readFileSync(filePath);
                        fs.writeFileSync(msmFilePath, newBuffer);
                        logger.info(`Sucessfully fixed ${items[1]}`);
                    } else {
                        try {
                            logger.info(`Removing ${items[1]}`);
                            if (fs.existsSync(msmFilePath)) {
                                fs.unlinkSync(msmFilePath);
                            }
                            logger.info(`Sucessfully removed ${items[1]}`);
                            deleteEmptyDirectorys(msmFilePath, items[1]);
                        } catch (deleteError) {
                            logger.error(`Error deleting file ${msmFilePath}: ${deleteError.message}`);
                        }
                    }
                } catch (writeError) {
                    logger.error(`Error writing file ${items[1]}: ${writeError.message}`);
                }
            });
        }

        // Clean Tmp
        const tmpContents = fs.readdirSync(tmpPath);
        tmpContents.forEach(fileName => {
            const filePath = path.join(tmpPath, fileName);
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (deleteError) {
                logger.error(`Error deleting file ${fileName}: ${deleteError.message}`);
            }
        });
    } catch (error) {
        logger.error(`Error in fixGame: ${error.message}`);
    }
}

function replaceAssets(names, settings, mainWindow) {
    try {
        var AppData = ""
        if(os.platform() === "win32"){
            AppData = path.join(process.env.AppData, "MSM_ModManager")
        } else {
            AppData = path.join(os.homedir(), "MSM_ModManager")
        }

        fixGame(settings, AppData);
        const msm_dir = settings.msm_directory;
        const fixPath = path.join(AppData, "tmp", "fix.toml");
        names.forEach((name) => {
            const modPath = path.join(msm_dir, name);
            const info = toml.parse(fs.readFileSync(path.join(modPath, "info.toml"), 'utf-8'));
            const assets = info.assets;
    
            var fix = {'assets': []};
            if (fs.existsSync(fixPath)){
                fix = toml.parse(fs.readFileSync(fixPath));
            }
    
            const replace = [];
            for (const key in assets) {
                const paths = assets[key];

                var isConflict = false
                fix.assets.forEach((asset) => {
                    if(asset.includes(paths[1])){
                        isConflict = true;
                    }
                })

                if(isConflict){
                    logger.info(`Skipped conflict ${paths[1]}`);
                } else {
                    const toCopy = path.join(modPath, "assets/" + paths[0]);
                    const toReplace = path.join(msm_dir, "data", paths[1]);
                    const toReplaceSimplified = paths[1].substring(paths[1].lastIndexOf('/'));
                    const tmpPath = path.join(AppData, "/tmp", toReplaceSimplified);
                    const newBuffer = fs.readFileSync(toCopy);
    
    
                    if (fs.existsSync(toReplace)) {
                        logger.info(`Replacing ${toReplaceSimplified}`);

                        fs.copyFileSync(toReplace, tmpPath);
                        fs.writeFileSync(toReplace, newBuffer);
                        //logger.info(`Successfully replaced ${toReplaceSimplified}`);
    
                        replace.push([toReplaceSimplified, paths[1]]);
                    } else {
                        logger.info(`Creating ${toReplaceSimplified}`);

                        createSubdirectoriesIfNotExist(toReplace)
                        fs.writeFileSync(toReplace, newBuffer);

                        //logger.info(`Successfully created ${toReplaceSimplified}`);
                        replace.push([toReplaceSimplified, paths[1]]);
                    }
                }
            }

            fix.assets = fix.assets.concat(replace);
            fs.writeFileSync(fixPath, toml.stringify(fix));
        })

        launchGame(settings,mainWindow)



    } catch (error) {
        logger.error("Error replacing assets:", error);
    }
}

function launchGame(settings, mainWindow) {
    try {
        if (settings.msm_directory === "") {
            dialog.showMessageBox(mainWindow, {
                "title": "Error",
                "message": "Couldn't find 'MySingingMonsters' folder, please input the 'MySingingMonsters' folder in the settings window",
                "buttons": ["OK"]
            });
        } else if (!fs.existsSync(settings.msm_directory)) {
            dialog.showMessageBox(mainWindow, {
                "title": "Error",
                "message": "The path to 'MySingingMonsters' has changed.\nInput the 'MySingingMonsters' path in the settings menu.",
                "buttons": ["OK"]
            });
        } else {
            logger.info("Killing MySingingMonsters.exe")
            exec('taskkill /IM "MySingingMonsters.exe" /F').on('exit', () => {
                //logger.info("Successfully killed MySingingMonsters.exe")

                logger.info("Launching MySingingMonsters.exe")
                exec(`cmd /K "${path.join(settings.msm_directory, "MySingingMonsters.exe")}"`); // Launch The Game
                //logger.info("Successfully launched MySingingMonsters.exe")

                if (settings.close_after_launch) {
                    mainWindow.close();
                }
            })

        }
    } catch (error) {
        logger.error("Error launching the game:", error);
    }
}

module.exports = {
    fixGame, replaceAssets, launchGame
}