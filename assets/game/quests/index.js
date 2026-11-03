/**
 * quests/index.js - the only file the rest of the game imports for quests.
 * Registers each mechanic under its Quest.questType number, so
 *   QuestMechanic.create(quest, opts)   (see quests/base.js)
 * returns the right class. To add a new mechanic: write quests/<name>.js, then
 * add one line to the table below.
 */
import { QuestMechanic } from './base.js';
import { TimelineQuest } from './timeline.js';
import { HotspotQuest } from './hotspot.js';
import { HelpCharacterQuest } from './helpCharacter.js';
import { MatchingQuest } from './matching.js';
import { DecodeClueQuest } from './decodeClue.js';

QuestMechanic.jenis = {
  1: TimelineQuest,   // timeline
  2: HotspotQuest,   // hotspot
  3: HelpCharacterQuest,   // helpCharacter
  4: MatchingQuest,   // matching
  5: DecodeClueQuest,   // decodeClue
};

export { QuestMechanic };
export { ChoiceQuest } from './choice.js';
export { TimelineQuest, HotspotQuest, HelpCharacterQuest, MatchingQuest, DecodeClueQuest };
