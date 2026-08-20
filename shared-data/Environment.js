import { SETTINGS } from "./Constants.js";

export const allBlocks = [];

export const groundBlocks = [];

export const stoneObjects = [];

export const spikePositions = [];

export const blockWidth = 1024 * SETTINGS.BLOCK_SCALE;
export const blockHeight = 1024 * SETTINGS.BLOCK_SCALE;

for (
    let x = 0;
    x < SETTINGS.WORLD_WIDTH;
    x += blockWidth
) {
    groundBlocks.push({
        x,
        y: SETTINGS.WORLD_HEIGHT - 32
    });
}