import { ENEMY_STATE } from "../../../../shared-data/Constants.js";
import { variable } from "../GameValues/LocalVariables.js";

const STATE_TINTS = {
    [ENEMY_STATE.IDLE]:     0xffffff,
    [ENEMY_STATE.WINDUP]:   0xffaa00,
    [ENEMY_STATE.ATTACK]:   0xff0000,
    [ENEMY_STATE.COOLDOWN]: 0xaaaaaa,
};

export function createRemoteEnemy(id, x, y) {
    const sprite = variable.sceneRef.add.sprite(x, y, "enemy");
    sprite.setDepth(500);

    variable.enemies[id] = { id, sprite, state: ENEMY_STATE.IDLE };
}

export function updateRemoteEnemy(id, x, y, state) {
    const enemy = variable.enemies[id];
    if (!enemy?.sprite) return;

    enemy.sprite.setPosition(x, y);

    if (state !== undefined && state !== enemy.state) {
        enemy.state = state;
        enemy.sprite.setTint(STATE_TINTS[state] ?? 0xffffff);
    }
}

export function removeRemoteEnemy(id) {
    const enemy = variable.enemies[id];
    if (enemy?.sprite) {
        enemy.sprite.destroy();
    }
    delete variable.enemies[id];
}
