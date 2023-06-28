const path = require('path');
const { fs, util, log } = require('vortex-api');
const { GAME_ID, EPIC_ID, GIMI_PATH, GIMI_MODS_PATH, GIMI_LOADER, findGame, findLauncher } = require('./common.js');
const { testGIMI, installGIMI, testGIMIMod, installGIMIMod, testGIMIModType } = require('./installers.js');

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
    getGameVersion,
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

async function getGameVersion(gamePath) {
  const gameConfigPath = path.join(gamePath, 'config.ini');
  try {
    const gameConfig = await fs.readFileAsync(gameConfigPath, { encoding: 'utf8' });
    const versionLine = gameConfig.split('\n').find(l => l.toLowerCase().includes('game_version='));
    return versionLine.replace('game_version=', '').trim();
  }
  catch(err) {
    log('warn', 'Could not determine version for Genshin Impact', err);
    throw new Error(`failed to parse ${gameConfigPath}`);
  }

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

module.exports = {
  default: main,
};
