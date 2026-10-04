/**
 * Mise en scène de fin de match, sans toucher à la logique : le directeur lit l'état
 * du contrôleur (game.state, game.match.winner) et ajuste seulement le cadrage de la
 * caméra et la lumière.
 *  - victoire : la caméra se rapproche de la main du joueur, lumière dorée ;
 *  - défaite : elle se tourne vers la main adverse, lumière un peu plus froide ;
 *  - le reste du temps, elle revient au cadrage normal.
 * Appelé après game.update (qui règle zoom et orbite) et avant engine.updateCamera.
 */
export class Director {
  constructor({ engine, world, player, bot, game }) {
    Object.assign(this, { engine, world, player, bot, game });
    this.focus = 0; // 0 : cadrage normal, 1 : gros plan de fin de match
    this.side = 0; // -1 joueur, +1 adversaire
  }

  update(dt) {
    const { engine, world, game } = this;
    const ended = game.state === 'ended' && game.match?.winner;
    const won = ended && game.match.winner === 'player';
    const target = ended ? 1 : 0;
    // Mouvement réduit : pas de travelling, on passe directement au cadrage final
    const k = engine.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.2);
    this.focus += (target - this.focus) * k;
    if (ended) this.side = won ? -1 : 1;

    const hand = this.side < 0 ? this.player : this.bot;
    const other = hand === this.player ? this.bot : this.player;
    const f = this.focus * this.focus * (3 - 2 * this.focus);
    const rig = engine.rig;
    // Léger travelling vers la main gagnante, regard un peu levé vers le geste de victoire
    rig.focusX = hand.basePosition.x * 0.32 * f;
    rig.zoom *= 1 + 0.04 * f;
    rig.lift += 0.42 * f;
    // La main gagnante se lève, doigts vers le haut ; l'autre reste à sa place
    hand.flourish = f;
    other.flourish = 0;
    world.setHighlight?.(won || (!ended && this.side < 0) ? f : -0.6 * f);
  }
}
