const path = require('path');
const { fs, util, log } = require('vortex-api');
const winapi = require('winapi-bindings');
const GAME_ID = 'genshinimpact';
const EPIC_ID = '41869934302e4b8cafac2d3c0e7c293d';
const MOD_FILE_EXT = ".ini";
const GIMI_PATH = path.join(util.getVortexPath('localAppData'), 'GenshinImpactMods');
const GIMI_MODS_PATH = path.join(GIMI_PATH, '3dmigoto', 'Mods');
const GIMI_LOADER = '3DMigoto Loader.exe';

const tools = [
  {
    id: 'gimi',
    name: 'Genshin Impact Model Importer',
    shortName: 'GIMI',
    queryPath: () => GIMI_PATH,
    executable: () => path.join('3dmigoto', GIMI_LOADER),
    requiredFiles: [
      path.join('3dmigoto', GIMI_LOADER),
      path.join('3dmigoto', 'd3d11.dll'),
      path.join('3dmigoto', 'd3dx.ini')
    ],
    relative: false,
    exclusive: true,
    defaultPrimary: true,
  },
  {
    id: 'genshin-launcher',
    name: 'Launcher',
    queryPath: () => findLauncher(),
    executable: () => 'launcher.exe',
    requiredFiles: [ 'launcher.exe' ],
    relative: false 
  }
];

function requiresLauncher(gamePath, store) {
  // If Epic, we'll launch via EGS (if this is not required it can be removed from the game registration!)
  if (store === 'epic') {
    return Promise.resolve({
      launcher: 'epic',
      addInfo: EPIC_ID
    });
  } else {
    return Promise.resolve(undefined);
  }
}

async function findLauncher() {
  // To find where the game is installed we first need to find the launcher. It will either be installed via EGS or manually. 
  try {
    // Check EGS
    const epic = await util.GameStoreHelper.findByAppId([EPIC_ID]);
    return epic.gamePath;
  }
  catch(err) {
    // Check for the standalone launcher
    log('debug', 'Genshin Impact not found on Epic, checking for it\'s own launcher');
    const instPathLauncher = winapi.RegGetValue(
      'HKEY_LOCAL_MACHINE',
      'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Genshin Impact',
      'InstallPath');
    if (!instPathLauncher) return;
    else return instPathLauncher.value;
  }
}

async function findGame() {
  // To find where the game is installed we first need to find the launcher. It will either be installed via EGS or manually. 
  const launcherPath = await findLauncher();
  if (!launcherPath) return;

  // Now we know where the launcher is we need to look at the config.ini to find the actual game.
  const launcherConfig = path.join(launcherPath, 'config.ini');
  try {
    const configData = await fs.readFileAsync(launcherConfig, { encoding: 'utf8' });
    const installPath = configData.split(`\n`)
      .find(r => r.toLowerCase().startsWith('game_install_path'));
    if (!installPath) throw new Error('game_install_path missing from Genshin Launcher config.ini');
    const gameFolder = installPath.replace('game_install_path=', '').trim();
    return gameFolder;
  }
  catch(err2) {
    log('warn', 'Error locating Genshin Impact', err2);
    return;
  }

}

function main(context) {
  context.registerGame({
    id: GAME_ID,
    name: 'Genshin Impact',
    mergeMods: true,
    setup: (discovery) => prepareForModding(context.api, discovery),
    queryPath: findGame,
    supportedTools: tools,
    queryModPath: () => '.',
    logo: 'gameart.jpg',
    executable: () => 'GenshinImpact.exe',
    requiredFiles: [
      'GenshinImpact.exe',
    ],
    requiresLauncher,
    environment: {},
    details: {
      customOpenModsPath: GIMI_MODS_PATH
    }
  });

  context.registerInstaller('genshinimpact-mod', 25, testGIMIMod, installGIMIMod);

  context.registerInstaller('gimi-installer', 15, testGIMI, installGIMI);
  // Register a new "Mod type" which will allow mods to be installed to the GIMI folder.
  context.registerModType('gimi-modtype', 25, gameId => gameId === GAME_ID, () => GIMI_PATH, testGIMIModType, { name: 'GIMI Mod' });

  return true;
}

async function testGIMIModType(instructions) {
  const GIMI_EXE = instructions.find(i => i.type === 'copy' && i.destination.toLowerCase().endsWith(GIMI_LOADER.toLowerCase()));
  if (!!GIMI_EXE) return true;

  // If there's an INI file, we can assume it's a GIMI mod.
  const INI_FILE = instructions.find(i => i.type === 'copy' && path.extname(i.destination) === MOD_FILE_EXT);
  if (!!INI_FILE) return true;

  else return false;

}

function prepareForModding(api, discovery) {
  // Ensure the mods folder exists, then check for GIMI
  return fs.ensureDirWritableAsync(path.join(GIMI_MODS_PATH))
    .then(() => checkForGIMI(api, path.join(GIMI_PATH, '3dmigoto', GIMI_LOADER)));
}

function checkForGIMI(api, GIMI_PATH) {
  return fs.statAsync(GIMI_PATH)
    .catch(() => {
      api.sendNotification({
        id: 'gimi-missing',
        type: 'warning',
        title: 'GIMI not installed',
        message: 'GIMI is required to mod Genshin Impact.',
        actions: [
          {
            title: 'Get GIMI',
            action: () => util.opn("https://www.nexusmods.com/genshinimpact/mods/89").catch(() => undefined),
          },
        ],
      });
    });
}


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
  const idx = modFile.indexOf(path.basename(modFile));
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

module.exports = {
  default: main,
};