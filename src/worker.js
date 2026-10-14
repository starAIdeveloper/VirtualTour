import { corners, match, translation, blend } from "./vision.js";
self.onmessage = (e) => {
  try {
    const { images, overlap } = e.data;
    self.postMessage({ phase: "Detecting Harris corners" });
    const features = images.slice(0, 2).map((im) => corners(im));
    const matches = match(...features);
    self.postMessage({ phase: "Feather blending ordered images" });
    const output = blend(images, overlap);
    self.postMessage(
      {
        done: true,
        features,
        matches,
        alignment: translation(matches),
        output,
      },
      [output.data.buffer],
    );
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
