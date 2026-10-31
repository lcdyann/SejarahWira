/**
 * ============================================================================
 * avatarConfig.js  -  which silat fighter each avatar becomes in a fight
 *
 * Outside a fight the student is the STATIC avatar picture (assets/gameAsset/avatar/<file>.png):
 * in the hub, on the map, in the mirror and in the story.
 * Inside a fight (Wira Training Grounds, The Great Siege) the game uses the silat sprite set
 * of the folder named here (assets/gameAsset/silat/<SET>/idle.png, punch.png ...).
 *
 * This table is in the game, not in the database (the database stays as it is):
 *   - add a new avatar:   add its file name and the silat set it should fight as
 *   - change a fighter:   change the set on that line
 * Silat sets that exist: M_BLACK M_BLUE M_EMERALD | F_HAIR_BLACK F_HAIR_BLUE F_HAIR_EMERALD |
 *                        F_HIJABI_BLACK F_HIJABI_BLUE F_HIJABI_EMERALD   (the EVIL sets are opponents)
 * ============================================================================
 */
export const AVATAR_SILAT = {
  'avatar_melayu_lelaki.png': 'M_EMERALD',
  'avatar_cina_lelaki.png': 'M_BLACK',
  'avatar_india_lelaki.png': 'M_BLUE',
  'avatar_bajau_lelaki.png': 'M_BLACK',
  'avatar_pribumi_lelaki.png': 'M_EMERALD',

  'avatar_melayu_kebaya.png': 'F_HAIR_EMERALD',
  'avatar_cina_perempuan.png': 'F_HAIR_BLACK',
  'avatar_india_perempuan.png': 'F_HAIR_BLUE',
  'avatar_iban_perempuan.png': 'F_HAIR_EMERALD',
  'avatar_murut_perempuan.png': 'F_HAIR_BLACK',

  'avatar_melayu_hijab.png': 'F_HIJABI_EMERALD',
  'avatar_india_hijab.png': 'F_HIJABI_BLUE',
  'avatar_kadazan_hijab.png': 'F_HIJABI_BLACK',
  'avatar_tenun_hijab.png': 'F_HIJABI_EMERALD'
};

/** used when an avatar file is not in the table above */
export const DEFAULT_SILAT = 'M_BLACK';

/**
 * Which way the avatar pictures look (as drawn). The map flips the picture when the student
 * walks the other way: a picture that looks LEFT is drawn as it is while walking left and
 * mirrored while walking right. If you ever draw avatars that look right, change this to 'right'.
 */
export const AVATAR_FACES = 'right'; //original avatar look right so fixed at right
