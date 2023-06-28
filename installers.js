const path = require('path');
const { fs } = require('vortex-api');
const { MOD_FILE_EXT, GAME_ID, GIMI_LOADER } = require('./common.js');

function testGIMI(files, gameId) {
    // See if we're installing GIMI by checking the EXE is in the archive.
    let supported = (gameId === GAME_ID) &&
        (files.find(file => path.basename(file).toLowerCase() === GIMI_LOADER.toLowerCase())!== undefined);

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}
  
async function installGIMI(files, destinationPath) {
    const modFile = files.find(file => path.basename(file).toLowerCase() === GIMI_LOADER.toLowerCase());
    const rootPath = path.dirname(modFile);

    const D3DX = path.join(rootPath, 'd3dx.ini');

    const D3DXTempPath = path.join(destinationPath, D3DX);

    let instructions = [];

    try {
        const fileData = await fs.readFileAsync(D3DXTempPath, { encoding: 'utf8' });
        const gamePath = path.join((await findGame()), 'GenshinImpact.exe');
        const newD3DX = addLaunchToINI(fileData, gamePath);

        instructions.push({
        type: 'generatefile',
        data: Buffer.from(newD3DX, 'utf8'),
        destination: D3DX,
        });
    }
    catch(err) {
        alert('Error updating D3DX file: '+err);
}
    
    // Remove directories and anything that isn't in the rootPath.
    const filtered = files.filter(file => 
      ((file.indexOf(rootPath) !== -1) 
      && (!file.endsWith(path.sep)))).filter(f => !f.toLowerCase().endsWith('d3dx.ini'));
  
    const copyInstructions = filtered.map(file => {
      return {
        type: 'copy',
        source: file,
        destination: file,
      };
    });
  
    return Promise.resolve({ instructions: instructions.length ? [...copyInstructions, ...instructions] : copyInstructions });
  }
  
function addLaunchToINI(currentINIdata, gameExePath) {
    // The line we want to add
    const launchLine = `launch = ${gameExePath}`;
    // Split into lines, trim off any wierd whitespace.
    const lines = currentINIdata.split('\n').map(l => l.trim());
    // Find the [Loader] heading line number
    let loaderIdx = lines.findIndex(l => l.toLowerCase().startsWith('[loader]'));
    //The loader heading doesn't exist so we'll just add it to the top.
    if (loaderIdx === -1) return [`[Launcher]`, launchLine, ...lines].join('\n');
    // Check to see if the launch line exists
    let launchIdx = lines.findIndex((line, index) => index >= loaderIdx && line.toLowerCase().startsWith('launch = '));
    // if we can find it, replace it
    if (launchIdx !== -1) {
        lines[launchIdx] = launchLine;
    }
    // otherwise insert it below the header
    else {
        lines.splice(loaderIdx + 1, 0, launchLine);
    }
    return lines.join('\n');
  }
  
function testGIMIMod(files, gameId) {
    // Make sure we're able to support this mod.
    let supported = (gameId === GAME_ID) &&
        (files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT)!== undefined);

    return Promise.resolve({
        supported,
        requiredFiles: [],
    });
}
  
function installGIMIMod(files) {
    // The .ini file is expected to always be positioned in the mods directory we're going to disregard anything placed outside the root.
    const modFile = files.find(file => path.extname(file).toLowerCase() === MOD_FILE_EXT);
    const rootPath = path.dirname(modFile);

    // Remove directories and anything that isn't in the rootPath.
    const filtered = files.filter(file => 
        ((file.indexOf(rootPath) !== -1) 
        && (!file.endsWith(path.sep))));

    const instructions = filtered.map(file => {
        return {
        type: 'copy',
        source: file,
        destination: path.join('3dmigoto', 'Mods', file),
        };
    });

    return Promise.resolve({ instructions });
}

async function testGIMIModType(instructions) {
    const GIMI_EXE = instructions.find(i => i.type === 'copy' && i.destination.toLowerCase().endsWith(GIMI_LOADER.toLowerCase()));
    if (!!GIMI_EXE) return true;

    // If there's an INI file, we can assume it's a GIMI mod.
    const INI_FILE = instructions.find(i => i.type === 'copy' && path.extname(i.destination) === MOD_FILE_EXT);
    if (!!INI_FILE) return true;

    else return false;
  
}

module.exports = { testGIMI, testGIMIMod, testGIMIModType, installGIMI, installGIMIMod };
