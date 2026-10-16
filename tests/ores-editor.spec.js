// Minerais (ores.yml) : lecture, validation et éditions ciblées comme BeltariaContent.
// La logique pure (window.OresModel) est comparée aux résultats de BeltariaContent LUI-MÊME :
// chaque fixture ci-dessous a été chargée par YamlConfiguration (beltariaspigot-api 1.8.8,
// SnakeYAML 1.33) puis OresConfig.from de BC 6.7, et le verdict (message à l'octet, ou minerais lus)
// est recopié ici. Fixtures synthétiques : aucun contenu de BeltariaContent n'est copié.
const path = require('path');
const zlib = require('zlib');
const { test, expect } = require('@playwright/test');

const PAGE = '/ores-editor.html';
// Captures d'écran : dans le dossier de sortie du test, ou dans ORES_SHOTS s'il est défini
const shot = (testInfo, name) => (process.env.ORES_SHOTS ? path.join(process.env.ORES_SHOTS, name) : testInfo.outputPath(name));

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  return errors;
}

// [nom, ores.yml, verdict de BC] : verdict = message de ConfigException, "EMPTY" (YAML illisible :
// Bukkit rend une configuration vide) ou la liste des minerais lus, résumés
// id|hôte|nom traduit|outil (OreHarvest.describe)|standIn|[butin]|monde=veines/taille/minY/maxY/replace;...
const BC_ORES_PARITY = [
  ["ok_full", "mithril_ore:\n  host: jungle_wood\n  name: \"&bMinerai &lde mithril\"\n  tool: IRON_PICKAXE\n  drop:\n    item: mithril_brut\n    amount: [1, 2]\n    fortune: true\n    silk-touch: true\n    experience: [3, 7]\n  veins-per-chunk: 6\n  vein-size: 6\n  min-y: 5\n  max-y: 32\n  replace: [STONE]\n  worlds:\n    world: {}\n    world_nether:\n      replace: [NETHERRACK]\n      veins-per-chunk: 10\n      max-y: 100\n", ["mithril_ore|jungle_wood|§bMinerai §lde mithril|IRON_PICKAXE minimum|standIn|[\"mithril_brut\",0,[1,2],[3,7],true,true]|world=6/6/5/32/STONE;world_nether=10/6/5/100/NETHERRACK"]],
  ["ok_list_tool", "gem_ore:\n  host: smooth_quartz\n  tool: [DIAMOND_PICKAXE, diamond_axe, DIAMOND_PICKAXE]\n  worlds: [world, \" world_the_end \", 7]\n  replace:\n    - STONE\n    - 87\n", ["gem_ore|smooth_quartz||DIAMOND_PICKAXE, DIAMOND_AXE||[null,0,[1,1],[0,0],false,true]|7=8/8/5/40/NETHERRACK+STONE;world=8/8/5/40/NETHERRACK+STONE;world_the_end=8/8/5/40/NETHERRACK+STONE"]],
  ["ok_empty_file", "# rien\n", []],
  ["empty_tab", "gem_ore:\n\thost: oak_wood\n", "EMPTY"],
  ["empty_top_list", "- a\n- b\n", "EMPTY"],
  ["empty_bad_indent", "gem_ore:\n  host: oak_wood\n bad: 1\n", "EMPTY"],
  ["bad_id_upper", "Gem_Ore:\n  host: oak_wood\n", "Gem_Ore : identifiant attendu en minuscules, chiffres, _ ou -"],
  ["dotted_id", "gem.ore:\n  host: oak_wood\n", "gem.host : hote absent : un minerai occupe un bloc vanilla, que le pack rhabille. Hotes possibles : smooth_stone, smooth_sandstone, smooth_quartz, smooth_red_sandstone, oak_wood, spruce_wood, birch_wood, jungle_wood, acacia_wood, dark_oak_wood"],
  ["scalar_entry", "gem_ore: 5\n", "gem_ore : bloc attendu (cle: valeur), recu : 5"],
  ["list_entry", "gem_ore: [1, 2.0]\n", "gem_ore : bloc attendu (cle: valeur), recu : [1, 2.0]"],
  ["host_missing", "gem_ore:\n  name: x\n", "gem_ore.host : hote absent : un minerai occupe un bloc vanilla, que le pack rhabille. Hotes possibles : smooth_stone, smooth_sandstone, smooth_quartz, smooth_red_sandstone, oak_wood, spruce_wood, birch_wood, jungle_wood, acacia_wood, dark_oak_wood"],
  ["host_unknown", "gem_ore:\n  host: stone\n", "gem_ore.host : hote inconnu : stone. Hotes possibles : smooth_stone, smooth_sandstone, smooth_quartz, smooth_red_sandstone, oak_wood, spruce_wood, birch_wood, jungle_wood, acacia_wood, dark_oak_wood"],
  ["host_upper_spaces", "gem_ore:\n  host: \" SMOOTH_STONE \"\n", ["gem_ore|smooth_stone||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["host_numeric", "gem_ore:\n  host: 5.0\n", "gem_ore.host : hote inconnu : 5.0. Hotes possibles : smooth_stone, smooth_sandstone, smooth_quartz, smooth_red_sandstone, oak_wood, spruce_wood, birch_wood, jungle_wood, acacia_wood, dark_oak_wood"],
  ["host_map", "gem_ore:\n  host: {a: 1}\n", "gem_ore.host : hote inconnu : MemorySection[path='gem_ore.host', root='YamlConfiguration']. Hotes possibles : smooth_stone, smooth_sandstone, smooth_quartz, smooth_red_sandstone, oak_wood, spruce_wood, birch_wood, jungle_wood, acacia_wood, dark_oak_wood"],
  ["dup_host", "a_ore:\n  host: oak_wood\nb_ore:\n  host: Oak_Wood\n", "b_ore.host : l'hote oak_wood est deja pris par a_ore : deux minerais sur le meme bloc seraient le meme bloc"],
  ["tool_none_lower", "gem_ore:\n  host: oak_wood\n  tool: none\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["tool_blank", "gem_ore:\n  host: oak_wood\n  tool: \"  \"\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["tool_lower_name", "gem_ore:\n  host: oak_wood\n  tool: iron pickaxe\n", ["gem_ore|oak_wood||IRON_PICKAXE minimum|standIn|[null,0,[1,1],[0,0],false,true]|"]],
  ["tool_unknown", "gem_ore:\n  host: oak_wood\n  tool: MITHRIL_PICK\n", "gem_ore.tool : gem_ore.tool : matiere inconnue : MITHRIL_PICK, ou NONE, ou une liste d'items"],
  ["tool_not_pickaxe", "gem_ore:\n  host: oak_wood\n  tool: DIAMOND_AXE\n", "gem_ore.tool : DIAMOND_AXE n'est pas une pioche. Paliers possibles : IRON_PICKAXE, WOOD_PICKAXE, STONE_PICKAXE, DIAMOND_PICKAXE, GOLD_PICKAXE, ou NONE, ou une liste d'items"],
  ["tool_numeric_id", "gem_ore:\n  host: oak_wood\n  tool: 278\n", ["gem_ore|oak_wood||DIAMOND_PICKAXE minimum|standIn|[null,0,[1,1],[0,0],false,true]|"]],
  ["tool_padded", "gem_ore:\n  host: oak_wood\n  tool: \" IRON_PICKAXE \"\n", "gem_ore.tool : gem_ore.tool : matiere inconnue :  IRON_PICKAXE , ou NONE, ou une liste d'items"],
  ["tool_list_empty", "gem_ore:\n  host: oak_wood\n  tool: []\n", "gem_ore.tool : liste d'outils vide : aucun item ne recolterait ce bloc. Pour n'exiger aucun outil, ecrire NONE"],
  ["tool_list_blank", "gem_ore:\n  host: oak_wood\n  tool: [IRON_PICKAXE, \"\"]\n", "gem_ore.tool : nom d'item vide dans la liste : [IRON_PICKAXE, ]"],
  ["tool_list_null", "gem_ore:\n  host: oak_wood\n  tool: [IRON_PICKAXE, ~]\n", "gem_ore.tool : nom d'item vide dans la liste : [IRON_PICKAXE, null]"],
  ["tool_list_unknown", "gem_ore:\n  host: oak_wood\n  tool: [IRON_PICKAXE, FOO]\n", "gem_ore.tool : matiere inconnue : FOO"],
  ["tool_map", "gem_ore:\n  host: oak_wood\n  tool: {a: 1}\n", "gem_ore.tool : gem_ore.tool : matiere inconnue : MemorySection[path='gem_ore.tool', root='YamlConfiguration'], ou NONE, ou une liste d'items"],
  ["tool_bool", "gem_ore:\n  host: oak_wood\n  tool: yes\n", "gem_ore.tool : gem_ore.tool : matiere inconnue : true, ou NONE, ou une liste d'items"],
  ["drop_scalar", "gem_ore:\n  host: oak_wood\n  drop: COAL\n", "gem_ore.drop : bloc attendu (cle: valeur), recu : COAL"],
  ["drop_empty_map", "gem_ore:\n  host: oak_wood\n  drop: {}\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["drop_null", "gem_ore:\n  host: oak_wood\n  drop:\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["drop_item_blank", "gem_ore:\n  host: oak_wood\n  drop:\n    item: \"  \"\n", "gem_ore.drop.item : identifiant vide : retirer la cle rend le minerai lui-meme"],
  ["drop_item_number", "gem_ore:\n  host: oak_wood\n  drop:\n    item: 263\n    data: 1\n", ["gem_ore|oak_wood||sans palier d'outil||[\"263\",1,[1,1],[0,0],false,true]|"]],
  ["drop_data_neg", "gem_ore:\n  host: oak_wood\n  drop:\n    data: -1\n", "gem_ore.drop.data : variante entre 0 et 32767 attendue, recu -1"],
  ["drop_data_big", "gem_ore:\n  host: oak_wood\n  drop:\n    data: 40000\n", "gem_ore.drop.data : variante entre 0 et 32767 attendue, recu 40000"],
  ["drop_data_str", "gem_ore:\n  host: oak_wood\n  drop:\n    data: \"3\"\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["amount_one", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: [1]\n", "gem_ore.drop.amount : fourchette [min, max] de deux nombres attendue, recu : [1]"],
  ["amount_desc", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: [3, 1]\n", "gem_ore.drop.amount : maximum sous le minimum : 1 < 3"],
  ["amount_str", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: deux\n", "gem_ore.drop.amount : nombre ou fourchette [min, max] attendu, recu : deux"],
  ["amount_neg", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: -1\n", "gem_ore.drop.amount : quantite negative : -1"],
  ["amount_float_list", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: [1, 2.9]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,2],[0,0],false,true]|"]],
  ["amount_float", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: 2.5\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[2,2],[0,0],false,true]|"]],
  ["amount_mixed_bad", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: [1.0, \"a\"]\n", "gem_ore.drop.amount : fourchette [min, max] de deux nombres attendue, recu : [1.0, a]"],
  ["amount_map", "gem_ore:\n  host: oak_wood\n  drop:\n    amount: {min: 1}\n", "gem_ore.drop.amount : nombre ou fourchette [min, max] attendu, recu : MemorySection[path='gem_ore.drop.amount', root='YamlConfiguration']"],
  ["xp_neg", "gem_ore:\n  host: oak_wood\n  drop:\n    experience: [-2, 3]\n", "gem_ore.drop.experience : experience negative : -2"],
  ["xp_desc", "gem_ore:\n  host: oak_wood\n  drop:\n    experience: [5, 2]\n", "gem_ore.drop.experience : maximum sous le minimum : 2 < 5"],
  ["bools_yaml11", "gem_ore:\n  host: oak_wood\n  drop:\n    item: COAL\n    fortune: on\n    silk-touch: no\n", ["gem_ore|oak_wood||sans palier d'outil||[\"COAL\",0,[1,1],[0,0],true,false]|"]],
  ["bools_strings", "gem_ore:\n  host: oak_wood\n  drop:\n    item: COAL\n    fortune: \"true\"\n    silk-touch: 0\n", ["gem_ore|oak_wood||sans palier d'outil||[\"COAL\",0,[1,1],[0,0],false,true]|"]],
  ["veins_65", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: 65\n", "gem_ore.veins-per-chunk : nombre de veines entre 0 et 64 attendu, recu 65.0"],
  ["veins_neg", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: -0.5\n", "gem_ore.veins-per-chunk : nombre de veines entre 0 et 64 attendu, recu -0.5"],
  ["veins_nan", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: .nan\n", "gem_ore.veins-per-chunk : nombre de veines entre 0 et 64 attendu, recu NaN"],
  ["veins_inf", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: .inf\n", "gem_ore.veins-per-chunk : nombre de veines entre 0 et 64 attendu, recu Infinity"],
  ["veins_big", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: 1e10\n", "gem_ore.veins-per-chunk : nombre de veines entre 0 et 64 attendu, recu 1.0E10"],
  ["veins_decimal", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: 0.25\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=0.25/8/5/40/STONE"]],
  ["veins_64_5", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: 64.5\n", "gem_ore.veins-per-chunk : nombre de veines entre 0 et 64 attendu, recu 64.5"],
  ["veins_str", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: \"2\"\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/40/STONE"]],
  ["veins_exp", "gem_ore:\n  host: oak_wood\n  veins-per-chunk: 1e1\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=10/8/5/40/STONE"]],
  ["size_0", "gem_ore:\n  host: oak_wood\n  vein-size: 0\n", "gem_ore.vein-size : taille de veine entre 1 et 64 attendue, recu 0"],
  ["size_65", "gem_ore:\n  host: oak_wood\n  vein-size: 65\n", "gem_ore.vein-size : taille de veine entre 1 et 64 attendue, recu 65"],
  ["size_float", "gem_ore:\n  host: oak_wood\n  vein-size: 6.9\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/6/5/40/STONE"]],
  ["size_octal", "gem_ore:\n  host: oak_wood\n  vein-size: 010\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/40/STONE"]],
  ["size_underscore", "gem_ore:\n  host: oak_wood\n  vein-size: 1_2\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/12/5/40/STONE"]],
  ["size_long", "gem_ore:\n  host: oak_wood\n  vein-size: 4294967304\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/40/STONE"]],
  ["size_huge_double", "gem_ore:\n  host: oak_wood\n  vein-size: 1.0e10\n", "gem_ore.vein-size : taille de veine entre 1 et 64 attendue, recu 2147483647"],
  ["miny_neg", "gem_ore:\n  host: oak_wood\n  min-y: -1\n", "gem_ore.min-y : altitude entre 0 et 255 attendue, recu -1"],
  ["maxy_256", "gem_ore:\n  host: oak_wood\n  max-y: 256\n", "gem_ore.max-y : altitude entre 0 et 255 attendue, recu 256"],
  ["maxy_below", "gem_ore:\n  host: oak_wood\n  min-y: 30\n  max-y: 10\n", "gem_ore.max-y : altitude maximale sous la minimale : 10 < 30"],
  ["both_bad_order", "gem_ore:\n  host: oak_wood\n  min-y: 300\n  max-y: -4\n", "gem_ore.min-y : altitude entre 0 et 255 attendue, recu 300"],
  ["sexagesimal", "gem_ore:\n  host: oak_wood\n  max-y: 1:00\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/60/STONE"]],
  ["hex", "gem_ore:\n  host: oak_wood\n  max-y: 0x20\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/32/STONE"]],
  ["replace_empty", "gem_ore:\n  host: oak_wood\n  replace: []\n", "gem_ore.replace : liste vide : un minerai qui ne remplace rien ne se genere jamais"],
  ["replace_scalar", "gem_ore:\n  host: oak_wood\n  replace: STONE\n", "gem_ore.replace : liste vide : un minerai qui ne remplace rien ne se genere jamais"],
  ["replace_item", "gem_ore:\n  host: oak_wood\n  replace: [STONE, DIAMOND]\n", "gem_ore.replace : DIAMOND n'est pas un bloc, donc rien a remplacer"],
  ["replace_unknown", "gem_ore:\n  host: oak_wood\n  replace: [STONE, MARBLE]\n", "gem_ore.replace : matiere inconnue : MARBLE"],
  ["replace_maps_only", "gem_ore:\n  host: oak_wood\n  replace: [{a: 1}]\n", "gem_ore.replace : liste vide : un minerai qui ne remplace rien ne se genere jamais"],
  ["replace_order", "gem_ore:\n  host: oak_wood\n  replace: [NETHERRACK, stone, 1, ENDER_STONE]\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/40/ENDER_STONE+NETHERRACK+STONE"]],
  ["worlds_empty_list", "gem_ore:\n  host: oak_wood\n  worlds: []\n", "gem_ore.worlds : aucun monde lu. Un monde sans reglage propre s'ecrit \"world: {}\" ou dans une liste \"worlds: [world]\" : une cle YAML sans valeur est effacee avant d'arriver ici, et le minerai ne se generait alors nulle part."],
  ["worlds_blank_item", "gem_ore:\n  host: oak_wood\n  worlds: [world, \"  \"]\n", "gem_ore.worlds : nom de monde vide dans la liste : [world,   ]"],
  ["worlds_null_item", "gem_ore:\n  host: oak_wood\n  worlds: [world, ~]\n", "gem_ore.worlds : nom de monde vide dans la liste : [world, null]"],
  ["worlds_empty_map", "gem_ore:\n  host: oak_wood\n  worlds: {}\n", "gem_ore.worlds : aucun monde lu. Un monde sans reglage propre s'ecrit \"world: {}\" ou dans une liste \"worlds: [world]\" : une cle YAML sans valeur est effacee avant d'arriver ici, et le minerai ne se generait alors nulle part."],
  ["worlds_null_world", "gem_ore:\n  host: oak_wood\n  worlds:\n    world:\n", "gem_ore.worlds : aucun monde lu. Un monde sans reglage propre s'ecrit \"world: {}\" ou dans une liste \"worlds: [world]\" : une cle YAML sans valeur est effacee avant d'arriver ici, et le minerai ne se generait alors nulle part."],
  ["worlds_scalar", "gem_ore:\n  host: oak_wood\n  worlds: world\n", "gem_ore.worlds : bloc attendu (cle: valeur), recu : world"],
  ["worlds_world_scalar", "gem_ore:\n  host: oak_wood\n  worlds:\n    world: 5\n", "gem_ore.worlds.world : bloc attendu (cle: valeur), recu : 5"],
  ["worlds_world_bad", "gem_ore:\n  host: oak_wood\n  max-y: 50\n  worlds:\n    world: {}\n    world_nether:\n      min-y: 60\n", "gem_ore.worlds.world_nether.max-y : altitude maximale sous la minimale : 50 < 60"],
  ["worlds_dotted", "gem_ore:\n  host: oak_wood\n  worlds:\n    world.nether: {max-y: 90}\n    other: {}\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|other=8/8/5/40/STONE;world=8/8/5/40/STONE"]],
  ["worlds_map_in_list", "gem_ore:\n  host: oak_wood\n  worlds: [{a: b}]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|{a=b}=8/8/5/40/STONE"]],
  ["worlds_inherit_override", "gem_ore:\n  host: oak_wood\n  vein-size: 12\n  replace: [STONE, GRAVEL]\n  worlds:\n    world: {veins-per-chunk: 0}\n    world_nether:\n      replace: [NETHERRACK]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=0/12/5/40/GRAVEL+STONE;world_nether=8/12/5/40/NETHERRACK"]],
  ["dup_keys", "gem_ore:\n  host: oak_wood\n  vein-size: 3\n  vein-size: 5\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/5/5/40/STONE"]],
  ["dup_ore", "gem_ore:\n  host: oak_wood\ngem_ore:\n  host: birch_wood\n", ["gem_ore|birch_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["second_bad", "a_ore:\n  host: oak_wood\nb_ore:\n  host: smooth_stone\n  vein-size: 99\n", "b_ore.vein-size : taille de veine entre 1 et 64 attendue, recu 99"],
  ["name_colors", "gem_ore:\n  host: oak_wood\n  name: \"&cRouge &&x &Lgras &zfin&\"\n", ["gem_ore|oak_wood|§cRouge &&x §lgras &zfin&|sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["name_number", "gem_ore:\n  host: oak_wood\n  name: 12\n", ["gem_ore|oak_wood|12|sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["bool_key", "true:\n  host: oak_wood\n", ["true|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["numeric_key", "42:\n  host: oak_wood\n", ["42|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["anchor_merge", "base: &b\n  host: oak_wood\n  vein-size: 4\ngem_ore:\n  <<: *b\n  host: birch_wood\n", ["base|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|", "gem_ore|birch_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|"]],
  ["unknown_keys", "gem_ore:\n  host: oak_wood\n  vein_size: 4\n  drop:\n    items: COAL\n  worlds:\n    world: {max_y: 3}\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/40/STONE"]],
  ["quoted_numbers", "gem_ore:\n  host: oak_wood\n  min-y: \"3\"\n  max-y: '4'\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/8/5/40/STONE"]],
  ["null_host_tilde", "gem_ore:\n  host: ~\n", "gem_ore.host : hote absent : un minerai occupe un bloc vanilla, que le pack rhabille. Hotes possibles : smooth_stone, smooth_sandstone, smooth_quartz, smooth_red_sandstone, oak_wood, spruce_wood, birch_wood, jungle_wood, acacia_wood, dark_oak_wood"],
  ["crlf", "gem_ore:\r\n  host: oak_wood\r\n  vein-size: 70\r\n", "gem_ore.vein-size : taille de veine entre 1 et 64 attendue, recu 70"],
  ["block_scalar_name", "gem_ore:\n  host: oak_wood\n  name: |\n    ligne\n  vein-size: 0\n", "gem_ore.vein-size : taille de veine entre 1 et 64 attendue, recu 0"],
  ["plus_sign", "gem_ore:\n  host: oak_wood\n  vein-size: +7\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/7/5/40/STONE"]],
  ["binary", "gem_ore:\n  host: oak_wood\n  vein-size: 0b101\n  worlds: [world]\n", ["gem_ore|oak_wood||sans palier d'outil||[null,0,[1,1],[0,0],false,true]|world=8/5/5/40/STONE"]]
];

// Un ores.yml commenté, au style de celui de BC (synthétique)
const COMMENTED = `# En-tete : tout ceci doit survivre aux modifications.
#   host : l'etat vanilla occupe

ruby_like:            # premier minerai
  host: smooth_stone
  name: "&cRubis factice"   # le nom
  tool: DIAMOND_PICKAXE
  drop:
    item: ruby_like_gem
    amount: 1
    experience: [3, 7]
  veins-per-chunk: 1
  vein-size: 4
  min-y: 0
  max-y: 12
  worlds: [world]

# Un bloc de rangement, sans generation.
block_like:
  host: oak_wood
  tool: IRON_PICKAXE

#exemple_commente:
#  host: jungle_wood
`;

// PNG généré dans la page : `frames` images verticales (rouge/bleu puis vert/jaune)
async function pngBuffer(page, w, h, frames) {
  const b64 = await page.evaluate(([w, h, frames]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h * frames;
    const g = c.getContext('2d');
    for (let f = 0; f < frames; f++) {
      g.fillStyle = f === 0 ? '#ff0000' : '#00ff00'; g.fillRect(0, f * h, w, h / 2);
      g.fillStyle = f === 0 ? '#0000ff' : '#ffff00'; g.fillRect(0, f * h + h / 2, w, h / 2);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, [w, h, frames]);
  return Buffer.from(b64, 'base64');
}
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) { crc ^= b; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function makeZip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, name, comp); centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
async function pluginZip(page) {
  return makeZip([
    { name: 'BeltariaContent/ores.yml', data: COMMENTED },
    { name: 'BeltariaContent/pack/pack.json', data: JSON.stringify({ description: 'x', 'marker-key': 'beltaria:id', 'base-item': 'stone', folders: { ores: 'beltaria/minerais' }, ores: { smooth_stone: { thirdperson: { scale: [0.3, 0.3, 0.3] } } } }, null, 2) },
    { name: 'BeltariaContent/pack/ores/smooth_stone/texture.png', data: await pngBuffer(page, 16, 16, 2) },
    { name: 'BeltariaContent/pack/ores/smooth_stone/texture.png.mcmeta', data: '{"animation":{"frametime":2}}' },
    { name: 'BeltariaContent/pack/ores/oak_wood/texture.png', data: await pngBuffer(page, 16, 16, 1) },
    { name: 'BeltariaContent/pack/ores/birch_wood/texture.png', data: await pngBuffer(page, 16, 16, 1) },
    { name: 'BeltariaContent/pack/ores/mithril/texture.png', data: await pngBuffer(page, 16, 16, 1) }
  ]);
}
const settle = page => page.evaluate(() => new Promise(r => setTimeout(r, 30)));

// --- Logique pure : parité avec BeltariaContent ------------------------------------------------
test.describe('ores.yml lu comme BeltariaContent (OresConfig.from)', () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE, { waitUntil: 'load' }); });

  test(`PARITÉ : ${BC_ORES_PARITY.length} fichiers, même verdict que BC (message à l'octet ou minerais lus)`, async ({ page }) => {
    const got = await page.evaluate(cases => cases.map(([name, yaml]) => {
      const v = OresModel.validate(yaml);
      if (v.status === 'empty') return [name, 'EMPTY'];
      if (v.status === 'error') return [name, v.error.message];
      const tool = t => (t.kind === 'tier' ? t.tier + ' minimum' : t.kind === 'any' ? 'sans palier d\'outil' : t.items.join(', '));
      return [name, v.ores.map(o => [o.id, o.host.id, o.name, tool(o.tool), o.standIn ? 'standIn' : '',
        JSON.stringify([o.drop.item, o.drop.data, o.drop.amount, o.drop.experience, o.drop.fortune, o.drop.silkTouch]),
        [...o.worlds.keys()].sort().map(w => { const x = o.worlds.get(w); return w + '=' + [x.veinsPerChunk, x.veinSize, x.minY, x.maxY, [...x.replace].sort().join('+')].join('/'); }).join(';')].join('|'))];
    }), BC_ORES_PARITY);
    for (let i = 0; i < BC_ORES_PARITY.length; i++) expect(got[i], BC_ORES_PARITY[i][0]).toEqual([BC_ORES_PARITY[i][0], BC_ORES_PARITY[i][2]]);
  });

  test('erreur : chemin, ligne de ores.yml et référence BC ; chaque entrée fautive listée', async ({ page }) => {
    const r = await page.evaluate(() => OresModel.validate('a_ore:\n  host: oak_wood\n\nb_ore:\n  host: smooth_stone\n  drop:\n    amount: [3, 1]\nc_ore:\n  host: nope\n'));
    expect(r.status).toBe('error');
    expect(r.error).toEqual({ message: 'b_ore.drop.amount : maximum sous le minimum : 1 < 3', path: 'b_ore.drop.amount', line: 7, ref: 'OreDrop.java:104-130' });
    expect(Object.keys(r.perOre)).toEqual(['b_ore', 'c_ore']);
    expect(r.perOre.c_ore.line).toBe(9);
    expect(r.perOre.c_ore.ref).toBe('OresConfig.java:131-135');
    const missing = await page.evaluate(() => OresModel.validate('x_ore:\n  name: y\n').error);
    expect(missing.line).toBe(1); // clé absente : la ligne de l'entrée
  });

  test('conseils : clés inconnues, mauvais types remplacés en silence, clé en double, fortune sans item', async ({ page }) => {
    const w = await page.evaluate(() => OresModel.validate('g:\n  host: oak_wood\n  vein_size: 4\n  vein-size: "8"\n  drop:\n    fortune: yes\n    silk-touch: 1\n  worlds:\n    world: {max_y: 3}\n  max-y: 10\n  max-y: 20\n').warnings.map(x => x.text + ' @' + x.line));
    const all = w.join('\n');
    expect(all).toContain('« vein_size » n\'est pas une clé lue par BC');
    expect(all).toContain('vein-size: 8 n\'est pas un nombre : MemorySection.getInt le remplace en silence');
    expect(all).toContain('drop.silk-touch: 1 n\'est pas true / false');
    expect(all).toContain('« max_y » n\'est pas une clé lue par BC dans un monde');
    expect(all).toContain('clé « g.max-y » écrite deux fois (lignes 10 et 11)');
    expect(all).toContain('drop.fortune sans drop.item : sans effet');
  });

  test('génération : valeurs exactes, et bornes de hauteur vérifiées sur le port de OreVein.shape (propriété)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = OresModel.generationStats({ veinsPerChunk: 0.25, veinSize: 4, minY: 0, maxY: 12, replace: ['STONE'] });
      const g2 = OresModel.generationStats({ veinsPerChunk: 6, veinSize: 64, minY: 5, maxY: 250, replace: ['STONE'] });
      // Port fidèle de OreVein.shape (OreVein.java:53-110) et de veinCount (OrePopulator.java:129-136)
      const shapeYs = (rnd, size, cy) => {
        const angle = rnd() * Math.PI, reach = size / 8;
        const fromX = Math.sin(angle) * reach, toX = -fromX, fromZ = Math.cos(angle) * reach, toZ = -fromZ;
        const fromY = cy + Math.floor(rnd() * 3) - 2, toY = cy + Math.floor(rnd() * 3) - 2;
        let lo = Infinity, hi = -Infinity;
        for (let step = 0; step < size; step++) {
          const along = step / size;
          const x = fromX + (toX - fromX) * along, y = fromY + (toY - fromY) * along, z = fromZ + (toZ - fromZ) * along;
          const swell = rnd() * size / 16, width = (Math.sin(Math.PI * along) + 1) * swell + 1;
          for (let ax = Math.floor(x - width / 2); ax <= Math.floor(x + width / 2); ax++) {
            const ox = (ax + 0.5 - x) / (width / 2); if (ox * ox >= 1) continue;
            for (let ay = Math.floor(y - width / 2); ay <= Math.floor(y + width / 2); ay++) {
              const oy = (ay + 0.5 - y) / (width / 2); if (ox * ox + oy * oy >= 1) continue;
              for (let az = Math.floor(z - width / 2); az <= Math.floor(z + width / 2); az++) {
                const oz = (az + 0.5 - z) / (width / 2);
                if (ox * ox + oy * oy + oz * oz < 1 && ay >= 0 && ay <= 255) { lo = Math.min(lo, ay); hi = Math.max(hi, ay); }
              }
            }
          }
        }
        return [lo, hi];
      };
      let seed = 12345;
      const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
      const check = (v, st, n) => {
        let lo = Infinity, hi = -Infinity, veins = 0;
        for (let i = 0; i < n; i++) {
          let c = Math.trunc(v.veinsPerChunk); const f = v.veinsPerChunk - c; if (f > 0 && rnd() < f) c++;
          veins += c;
          const cy = v.minY + Math.floor(rnd() * (v.maxY - v.minY + 1));
          const [a, b] = shapeYs(rnd, v.veinSize, cy);
          lo = Math.min(lo, a); hi = Math.max(hi, b);
        }
        return { lo, hi, mean: veins / n, bound: st.blocksY };
      };
      return { g, g2, c1: check({ veinsPerChunk: 0.25, veinSize: 4, minY: 0, maxY: 12 }, g, 20000), c2: check({ veinsPerChunk: 6, veinSize: 64, minY: 5, maxY: 250 }, g2, 3000) };
    });
    expect(r.g).toMatchObject({ expected: 0.25, whole: 0, frac: 0.25, chunksWithVein: 0.25, oneIn: 4, layers: 13, blocksY: [0, 12] });
    expect(r.g.perLayer).toBeCloseTo(0.25 / 13, 12);
    expect(r.g2).toMatchObject({ chunksWithVein: 1, oneIn: null, layers: 246, blocksY: [0, 253] }); // y < 250 + (64/8 + 1)/2 - 0,5 = 254
    for (const c of [r.c1, r.c2]) { // les cases simulées restent dans les bornes annoncées
      expect(c.lo).toBeGreaterThanOrEqual(c.bound[0]);
      expect(c.hi).toBeLessThanOrEqual(c.bound[1]);
    }
    expect(r.c1.mean).toBeCloseTo(0.25, 1); // espérance = veins-per-chunk
    expect(r.c2.mean).toBe(6);
  });

  test('pack.json : section ores qui bloque tout le pack (hôte inconnu, objet attendu, folders.ores vide)', async ({ page }) => {
    const r = await page.evaluate(() => [
      OresModel.packOresProblems({ ores: { mithril_ore: {} } }),
      OresModel.packOresProblems({ ores: { smooth_stone: 5, Oak_Wood: {} } }),
      OresModel.packOresProblems({ folders: { ores: '' }, ores: [] })
    ]);
    // messages tels que l'assembleur de BC les lève (gradlew buildPack, vérifié)
    expect(r[0][0].text).toBe('pack.json : ores.mithril_ore : aucun bloc hote de ce nom. Hotes possibles : smooth_stone, smooth_sandstone, smooth_quartz, smooth_red_sandstone, oak_wood, spruce_wood, birch_wood, jungle_wood, acacia_wood, dark_oak_wood');
    expect(r[1].map(x => x.text)).toEqual(['pack.json : ores.smooth_stone : objet attendu']);
    expect(r[2].map(x => x.text)).toEqual(['pack.json : ores : chaine non vide attendue', 'pack.json : ores doit etre un objet identifiant -> reglages']);
  });
});

// --- Éditions ciblées ---------------------------------------------------------------------------
test.describe('éditions qui préservent le fichier', () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE, { waitUntil: 'load' }); });

  test('seules les lignes modifiées changent : commentaires, style et fins de ligne (LF et CRLF) conservés', async ({ page }) => {
    const r = await page.evaluate(text => {
      const M = OresModel;
      const run = t => {
        const raw = JSON.parse(JSON.stringify(M.rawOre(t, 'ruby_like')));
        raw['vein-size'] = 6;                 // valeur changée
        delete raw.tool;                      // clé retirée
        raw.drop.fortune = true;              // clé ajoutée dans un bloc imbriqué
        raw.worlds = { world: {}, world_nether: { replace: ['NETHERRACK'] } }; // liste -> bloc par monde
        return M.setOre(t, 'ruby_like', raw);
      };
      const crlf = text.replace(/\n/g, '\r\n');
      return { lf: run(text), crlf: run(crlf), same: M.setOre(text, 'ruby_like', M.rawOre(text, 'ruby_like')) === text };
    }, COMMENTED);
    expect(r.same).toBe(true);
    const expected = COMMENTED
      .replace('  tool: DIAMOND_PICKAXE\n', '')
      .replace('    experience: [3, 7]\n', '    experience: [3, 7]\n    fortune: true\n')
      .replace('  vein-size: 4\n', '  vein-size: 6\n')
      .replace('  worlds: [world]\n', '  worlds:\n    world: {}\n    world_nether:\n      replace: [NETHERRACK]\n');
    expect(r.lf).toBe(expected);
    expect(r.crlf).toBe(expected.replace(/\n/g, '\r\n'));
    const v = await page.evaluate(t => OresModel.validate(t), r.lf);
    expect(v.status).toBe('ok');
  });

  test('ajout, renommage et retrait d\'une entrée : le reste du fichier ne bouge pas', async ({ page }) => {
    const r = await page.evaluate(text => {
      const M = OresModel;
      let t = M.appendOre(text, 'new_ore', { host: 'jungle_wood', worlds: { world: {} } });
      const added = t;
      t = M.renameOre(t, 'block_like', 'storage_like');
      const renamed = t;
      t = M.removeOre(t, 'new_ore');
      return { added, renamed, removed: t, entry: M.entryText(renamed, 'ruby_like') };
    }, COMMENTED);
    expect(r.added.startsWith(COMMENTED)).toBe(true);
    expect(r.added.endsWith('\nnew_ore:\n  host: jungle_wood\n  worlds:\n    world: {}\n')).toBe(true);
    expect(r.renamed).toContain('\nstorage_like:\n  host: oak_wood\n');
    expect(r.removed).toBe(COMMENTED.replace('\nblock_like:', '\nstorage_like:') + '\n');
    expect(r.entry.split('\n')[0]).toBe('ruby_like:            # premier minerai');
    expect(r.entry).toContain('  worlds: [world]');
  });
});

// --- Interface ----------------------------------------------------------------------------------
test.describe('interface Minerais (ores.yml)', () => {
  test('dossier du plugin en .zip : hôtes, textures, notes du pack, formulaire, génération, sortie', async ({ page }, testInfo) => {
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto(PAGE, { waitUntil: 'load' });
    await expect(page.locator('a.st-back[href="index.html"]')).toHaveText('← Beltaria Studio');
    await page.setInputFiles('#packFiles', { name: 'BeltariaContent.zip', mimeType: 'application/zip', buffer: await pluginZip(page) });
    await expect(page.locator('#status')).toHaveText('Accepté par BeltariaContent : 2 minerai(s), 2 hôte(s) sur 10.');
    const s = await page.evaluate(() => OresEditor.getState());
    expect(s.selected).toBe('ruby_like');
    expect(s.textures.sort()).toEqual(['birch_wood', 'oak_wood', 'smooth_stone']);
    expect(s.packPath).toBe('BeltariaContent/pack/pack.json');
    // hôtes : pris / libres, texture, vue d'item réglée dans pack.json
    await expect(page.locator('#hostCount')).toHaveText('2 / 10 pris');
    await expect(page.locator('.host[data-host="smooth_stone"]')).toContainText('pris par ruby_like');
    await expect(page.locator('.host[data-host="smooth_stone"]')).toContainText('texture animée 2 img.');
    await expect(page.locator('.host[data-host="smooth_stone"]')).toContainText('vue d\'item réglée (pack.json)');
    await expect(page.locator('.host[data-host="jungle_wood"]')).toContainText('libre');
    // notes du pack, comme PackBuild
    await expect(page.locator('#msgs')).toContainText('ores/mithril : aucun bloc hote de ce nom, dossier saute.');
    await expect(page.locator('#msgs')).toContainText('ores/birch_wood/ habille un bloc que plus rien ne pose');
    // texture animée : première image puis animation ; avertissement sur l'item
    await expect(page.locator('#texInfo')).toContainText('BC copie texture.png à côté de sa règle CIT, mais pas son .mcmeta');
    const px = await page.evaluate(() => Array.from(document.getElementById('texFlat').getContext('2d').getImageData(10, 10, 1, 1).data));
    expect(px[0] > 150 && px[1] < 90 || px[1] > 150).toBe(true);
    // génération du minerai sélectionné
    await expect(page.locator('#gen')).toContainText('monde world');
    await expect(page.locator('#gen')).toContainText('y 0 à 12, uniforme : 13 couche(s)');
    // formulaire : vein-size 99 -> refus avec la ligne ; le texte ne change que sur cette ligne
    await page.fill('#f-size', '99');
    await page.locator('#f-size').dispatchEvent('change');
    await expect(page.locator('#status')).toHaveText('Refusé par BeltariaContent : ruby_like.vein-size : taille de veine entre 1 et 64 attendue, recu 99');
    await expect(page.locator('#msgs .loc').first()).toHaveText('ores.yml:13'); // ligne de « vein-size: 99 »
    await expect(page.locator('#diffInfo')).toHaveText('−1 / +1 ligne(s)');
    let out = await page.evaluate(() => OresEditor.exportText());
    expect(out).toBe(COMMENTED.replace('  vein-size: 4\n', '  vein-size: 99\n'));
    // clic sur la ligne : sélection dans le texte
    await page.locator('#msgs .loc').first().click();
    expect(await page.evaluate(() => { const t = document.getElementById('out'); return t.value.slice(t.selectionStart, t.selectionEnd); })).toBe('  vein-size: 99');
    await page.fill('#f-size', '5');
    await page.locator('#f-size').dispatchEvent('change');
    await expect(page.locator('#status')).toContainText('Accepté');
    // drop : fortune true par le menu ; mondes : passage au bloc par monde puis surcharge Nether
    await page.selectOption('#f-drop-fortune', 'true');
    await page.selectOption('#f-worlds-mode', 'map');
    await page.click('#f-add-world');
    await expect(page.locator('#f-w1-name')).toHaveValue('world_2');
    await page.fill('#f-w1-name', 'world_nether');
    await page.locator('#f-w1-name').dispatchEvent('change');
    await expect(page.locator('#f-w1-max-y')).toBeVisible();
    await page.fill('#f-w1-max-y', '100');
    await page.locator('#f-w1-max-y').dispatchEvent('change');
    await expect(page.locator('#gen')).toContainText('monde world_nether');
    out = await page.evaluate(() => OresEditor.exportText());
    expect(out).toContain('    amount: 1\n    fortune: true\n    experience: [3, 7]\n'); // clé ajoutée à sa place dans l'ordre de la doc de BC
    expect(out).toContain('  worlds:\n    world: {}\n    world_nether:\n      max-y: 100\n');
    expect(out.startsWith('# En-tete : tout ceci doit survivre aux modifications.\n#   host : l\'etat vanilla occupe\n\nruby_like:            # premier minerai\n')).toBe(true);
    expect(out).toContain('\n#exemple_commente:\n#  host: jungle_wood\n');
    // hôte déjà pris : refus de BC, hôte en rouge
    await page.click('.ore-btn[data-id="block_like"]');
    await page.selectOption('#f-host', 'smooth_stone');
    await expect(page.locator('#status')).toContainText('block_like.host : l\'hote smooth_stone est deja pris par ruby_like');
    await expect(page.locator('.host[data-host="smooth_stone"]')).toHaveClass(/clash/);
    // nouveau minerai : premier hôte libre, en fin de fichier
    await page.selectOption('#f-host', 'oak_wood');
    await page.click('#addOre');
    await expect(page.locator('#f-id')).toHaveValue('nouveau_minerai');
    await expect(page.locator('#f-host')).toHaveValue('smooth_sandstone');
    await expect(page.locator('#snippet')).toHaveValue(/^nouveau_minerai:\n  host: smooth_sandstone\n/);
    await page.screenshot({ path: shot(testInfo, 'test-desktop.png'), fullPage: true });
    expect(errors).toEqual([]);
  });

  test('syntaxe YAML cassée : catalogue vide comme Bukkit, texte éditable pour corriger', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(PAGE, { waitUntil: 'load' });
    await page.setInputFiles('#oresFile', { name: 'ores.yml', mimeType: 'text/yaml', buffer: Buffer.from('gem_ore:\n\thost: oak_wood\n') });
    await expect(page.locator('#status')).toContainText('BC démarre sans AUCUN minerai');
    await expect(page.locator('#msgs')).toContainText('Cannot load');
    await page.fill('#out', 'gem_ore:\n  host: oak_wood\n');
    await expect(page.locator('#status')).toHaveText('Accepté par BeltariaContent : 1 minerai(s), 1 hôte(s) sur 10.');
    expect(errors).toEqual([]);
  });

  test('téléphone 375 px : aucun défilement horizontal, formulaire utilisable', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(PAGE, { waitUntil: 'load' });
    await page.setInputFiles('#packFiles', { name: 'BeltariaContent.zip', mimeType: 'application/zip', buffer: await pluginZip(page) });
    await expect(page.locator('#status')).toContainText('Accepté');
    await page.selectOption('#f-worlds-mode', 'map');
    await expect(page.locator('#f-w0-name')).toBeVisible();
    const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    expect(w.doc).toBeLessThanOrEqual(375);
    expect(w.body).toBeLessThanOrEqual(375);
    const box = await page.locator('#f-vpc').boundingBox();
    expect(box.width).toBeGreaterThan(100);
    await page.screenshot({ path: shot(testInfo, 'test-phone.png'), fullPage: true });
    expect(errors).toEqual([]);
    await context.close();
  });
});
