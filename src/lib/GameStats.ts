import { ProtectedEventEmitter } from 'eventemitter-ts';
import { KQStream } from './KQStream';
import { GameConstants } from './GameConstants';
import { 
    Character, 
    PlayerKill, 
    BerryDeposit, 
    BerryKickIn, 
    CharacterType, 
    UseMaiden, 
    Maiden, 
    Position 
} from './models/KQStream';

type StatisticType = 'kills' | 'queen_kills' | 'warrior_kills' | 'deaths' | 'berries_sunk' | 'berries_kicked_in';

export type GameStatsType = {
    [character in Character]: CharacterStatsType
};

type CharacterStatsType = {
    [statisticType in StatisticType]: number
};

type GameStateType = {
    [character in Character]: CharacterStateType
};

type CharacterStateType = {
    isWarrior: boolean;
    isSpeed: boolean;
};

export type ChangeFilter = {
    [character in Character]?: StatisticType[];
};

export interface KQStat {
    character: Character;
    statistic: StatisticType;
    value: number;
}

interface Events {
    'change': KQStat;
}

export class GameStats extends ProtectedEventEmitter<Events> {
    private stream: KQStream;
    private hasGameStartBeenEncountered: boolean;
    private gameStats: GameStatsType;
    private gameState: GameStateType;

    /**
     * Complete list of valid statistic types.
     */
    private static get statisticTypes(): StatisticType[] {
        return [
            'kills',
            'queen_kills',
            'warrior_kills',
            'deaths',
            'berries_sunk',
            'berries_kicked_in'
        ];
    }
    /**
     * Default game statistics. This is what the
     * statistics of a game are when it begins.
     */
    static get defaultGameStats(): GameStatsType {
        return {
            [Character.GoldQueen]: GameStats.defaultCharacterStats,
            [Character.BlueQueen]: GameStats.defaultCharacterStats,
            [Character.GoldStripes]: GameStats.defaultCharacterStats,
            [Character.BlueStripes]: GameStats.defaultCharacterStats,
            [Character.GoldAbs]: GameStats.defaultCharacterStats,
            [Character.BlueAbs]: GameStats.defaultCharacterStats,
            [Character.GoldSkulls]: GameStats.defaultCharacterStats,
            [Character.BlueSkulls]: GameStats.defaultCharacterStats,
            [Character.GoldChecks]: GameStats.defaultCharacterStats,
            [Character.BlueChecks]: GameStats.defaultCharacterStats
        };
    }
    private static get defaultCharacterStats(): CharacterStatsType {
        return {
            kills: 0,
            queen_kills: 0,
            warrior_kills: 0,
            deaths: 0,
            berries_sunk: 0,
            berries_kicked_in: 0
        };
    }
    private static get defaultGameState(): GameStateType {
        return {
            [Character.GoldQueen]: GameStats.defaultCharacterState,
            [Character.BlueQueen]: GameStats.defaultCharacterState,
            [Character.GoldStripes]: GameStats.defaultCharacterState,
            [Character.BlueStripes]: GameStats.defaultCharacterState,
            [Character.GoldAbs]: GameStats.defaultCharacterState,
            [Character.BlueAbs]: GameStats.defaultCharacterState,
            [Character.GoldSkulls]: GameStats.defaultCharacterState,
            [Character.BlueSkulls]: GameStats.defaultCharacterState,
            [Character.GoldChecks]: GameStats.defaultCharacterState,
            [Character.BlueChecks]: GameStats.defaultCharacterState
        };
    }
    private static get defaultCharacterState(): CharacterStateType {
        return {
            isWarrior: false,
            isSpeed: false
        };
    }
    private static get defaultChangeFilter(): ChangeFilter {
        return {
            [Character.GoldQueen]: GameStats.statisticTypes,
            [Character.BlueQueen]: GameStats.statisticTypes,
            [Character.GoldStripes]: GameStats.statisticTypes,
            [Character.BlueStripes]: GameStats.statisticTypes,
            [Character.GoldAbs]: GameStats.statisticTypes,
            [Character.BlueAbs]: GameStats.statisticTypes,
            [Character.GoldSkulls]: GameStats.statisticTypes,
            [Character.BlueSkulls]: GameStats.statisticTypes,
            [Character.GoldChecks]: GameStats.statisticTypes,
            [Character.BlueChecks]: GameStats.statisticTypes
        };
    }

    /**
     * Returns true if character is a queen.
     * 
     * @param character The character to evaluate
     */
    private static isQueen(character: Character): boolean {
        return character === Character.GoldQueen || character === Character.BlueQueen;
    }

    /**
     * Returns true if the given character is on the gold team
     * @param character The character to evaluate
     */
    private static isGold(character: Character): boolean {
        // All characters on Gold team are identified by an odd number
        return (character % 2) !== 0;
    }

    /**
     * Returns true if the kill was maybe a snail eating a drone (i.e. snail kill).
     * 
     * - On day and dusk maps, snail kills happen at `y: 20`.
     * - On night map, snail kills happen at `y: 500`.
     * 
     * Drones killed while standing on a platform at the same height as the snail
     * will also have the same y-pos as a snail kill.
     * 
     * @param kill The kill to evaluate
     */
    private static isMaybeSnailKill(kill: PlayerKill): boolean {
        // Snail kills can happen within roughly 40 position units from
        // the default y-pos of 20 on day and dusk, and 500 on night.
        return (
            (kill.pos.y > -20 && kill.pos.y < 60) ||
            (kill.pos.y > 460 && kill.pos.y < 540)
        );
    }

    /**
     * Returns true if a berry that sunk into a hive at the given
     * position went into the Gold team's hive.
     * 
     * @param berryPos Position of a berry that was deposited or kicked into a hive
     */
    private static sunkIntoGoldHive(berryPos: Position): boolean {
        return berryPos.x < GameConstants.MAP_CENTER.x;
    }

    constructor(stream: KQStream) {
        super();
        this.stream = stream;
    }

    start() {
        this.resetStats();
        this.hasGameStartBeenEncountered = false;
        this.stream.removeAllListeners('playernames');
        this.stream.removeAllListeners('playerKill');
        this.stream.on('playernames', () => {
            this.resetStats();
            if (!this.hasGameStartBeenEncountered) {

                // Handle player kill events
                this.stream.on('playerKill', (kill: PlayerKill) => {
                    this.processKill(kill);
                });

                // Handle berry events
                this.stream.on('berryDeposit', (depositEvent: BerryDeposit) => {
                    this.processBerryDeposit(depositEvent);
                });
                this.stream.on('berryKickIn', (berryKickIn: BerryKickIn) => {
                    this.processBerryKickIn(berryKickIn);
                });

                // Handle bear transformation events
                this.stream.on('useMaiden', (useMaidenEvent: UseMaiden) => {
                    this.processUseMaiden(useMaidenEvent);
                });
            }
            this.hasGameStartBeenEncountered = true;
        });
    }

    /**
     * Triggers a change event on the specified statistics.
     * If no filter is specified, a change event is triggered
     * for all statistics.
     * 
     * @param eventType The 'change' event
     * @param filter The statistics to filter
     */
    trigger(eventType: 'change', filter?: ChangeFilter) {
        if (filter === undefined) {
            filter = GameStats.defaultChangeFilter;
        }
        for (let character of Object.keys(filter)) {
            const characterNumber = Number(character);
            if (!isNaN(characterNumber)) {
                for (let statistic of filter[character]) {
                    this.protectedEmit('change', {
                        character: characterNumber,
                        statistic: statistic,
                        value: this.gameStats[characterNumber][statistic]
                    });
                }
            }
        }
    }

    private resetStats() {
        this.gameStats = GameStats.defaultGameStats;
        this.gameState = GameStats.defaultGameState;
        this.trigger('change');
    }

    private processKill(kill: PlayerKill) {
        const filter: ChangeFilter = {
            [kill.by]: ['kills'],
            [kill.killed]: ['deaths']
        };

        // Increment kills and deaths
        this.gameStats[kill.by].kills++;
        this.gameStats[kill.killed].deaths++;

        switch (kill.killedCharType) {
            case CharacterType.Queen:
                this.gameStats[kill.by].queen_kills++;
                filter[kill.by]!.push('queen_kills');
                break;
            case CharacterType.Soldier:
                this.gameStats[kill.by].warrior_kills++;
                filter[kill.by]!.push('warrior_kills');    
                break;
            default:
                break;    
        }

        // Set state of characters
        if (!GameStats.isQueen(kill.killed)) {
            this.gameState[kill.killed].isWarrior = false;
            this.gameState[kill.killed].isSpeed = false;
        }

        this.trigger('change', filter);
    }

    private processBerryDeposit(berryDeposit: BerryDeposit) {

        const filter: ChangeFilter = {
            [berryDeposit.character]: ['berries_sunk']
        };

        this.gameStats[berryDeposit.character].berries_sunk++;

        this.trigger('change', filter);
    }

    private processBerryKickIn(berryKickIn: BerryKickIn) {

        const filter: ChangeFilter = {
            [berryKickIn.character]: ['berries_kicked_in']
        };

        let sunkIntoFriendlyHive: boolean = 
            GameStats.isGold(berryKickIn.character) && GameStats.sunkIntoGoldHive(berryKickIn.pos)
            || !GameStats.isGold(berryKickIn.character) && !GameStats.sunkIntoGoldHive(berryKickIn.pos);
        
        // TODO: save more robust stats surrounding this.
        // Raw number of berries kicked into hives, number of berries kicked
        // into enemy hive, and of course berries put into friendly hive as below.
        if (sunkIntoFriendlyHive) {
            this.gameStats[berryKickIn.character].berries_kicked_in++;
        }

        this.trigger('change', filter);
    }

    private processUseMaiden(useMaiden: UseMaiden) {

        switch (useMaiden.type) {
            case Maiden.Warrior:
                this.gameState[useMaiden.character].isWarrior = true;
                break;
            case Maiden.Speed:
                this.gameState[useMaiden.character].isSpeed = true;    
                break;
            default:
                break;    
        }
    }
}
