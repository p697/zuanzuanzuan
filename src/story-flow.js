// Scene order from the original EventManager stage list. IDs are locale-independent.
export const storyQueues = {
  opening: ["opening", "quest1"],
  quest3: ["quest2", "loading1", "loading3", "quest3"],
  quest4: ["quest4", "loading2", "quest7"],
  rescueIntro: ["quest5"],
  rescue: ["quest6"],
  ending_happy: ["ending_happy"],
  ending_not: ["ending_not"],
};
export function validCutscene(scene) {
  return (
    scene == null ||
    (Array.isArray(storyQueues[scene.id]) &&
      Number.isInteger(scene.index) &&
      scene.index >= 0 &&
      scene.index < storyQueues[scene.id].length &&
      Number.isFinite(scene.time) &&
      scene.time >= 0 &&
      scene.time <= 60)
  );
}
