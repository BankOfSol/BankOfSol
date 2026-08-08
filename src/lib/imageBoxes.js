// One place to define the aspect ratio of every photo box in the shop.
// Each value must match the CSS box the image lands in, so the crop the
// user picks in <ImageCropUploader> is exactly what they see on the card.
// Pair with `aspect-ratio` + `object-fit: cover` in site.css.

export const ASPECTS = {
  square: 1, // 1:1 — product photos (.product-img, .gallery-main) and the shop logo
};

// Suggested source dimensions (the long edge is capped at 1600px on upload):
//   square -> 1080 x 1080
