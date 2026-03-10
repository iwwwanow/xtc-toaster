export const alphaComposing = (
  fgColor: number,
  fgAlpha: number,
  bgColor: number,
  bgAlpha: number,
  resultAlpha: number,
) => {
  const result =
    (fgColor * fgAlpha + bgColor * bgAlpha * (1 - fgAlpha)) / resultAlpha;
  return result;
};
