// Force/mass/drag movement, the same model the player uses in
// playerMovementCheck (accel = force/mass - drag*velocity), but integrated
// exactly over dt so it is frame-rate independent on the server.
//   dv/dt = F/m - c*v   =>   terminal speed = F / (m * c)
export function stepDragVelocity(velocity, force, mass, dragCoefficient, dtSeconds) {
    const acceleration = force / mass;

    if (dragCoefficient <= 0) {
        return velocity + acceleration * dtSeconds;
    }

    const terminal = acceleration / dragCoefficient;
    return terminal + (velocity - terminal) * Math.exp(-dragCoefficient * dtSeconds);
}
