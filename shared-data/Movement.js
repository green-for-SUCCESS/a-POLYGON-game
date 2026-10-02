// Same force/mass/drag model the player uses in playerMovementCheck, per frame:
//   v' = v + F/m - c*v
// Here it is advanced by dt using the closed form of that recurrence at the
// 60 Hz reference rate the player's constants are tuned for, so it is
// frame-rate independent on the server:  terminal speed = F / (m * c)
const REFERENCE_FPS = 60;

export function stepDragVelocity(velocity, force, mass, dragCoefficient, dtSeconds) {
    const acceleration = force / mass;
    const frames = dtSeconds * REFERENCE_FPS;

    if (dragCoefficient <= 0) {
        return velocity + acceleration * frames;
    }

    const terminal = acceleration / dragCoefficient;
    const retained = Math.pow(1 - dragCoefficient, frames);
    return terminal + (velocity - terminal) * retained;
}
