import { Channel } from "../classes/composition.interfaces";

export const getChannelIndex = (channel: Channel): number => {
  switch (channel) {
    case Channel.Red:
      return 0;
    case Channel.Green:
      return 1;
    case Channel.Blue:
      return 2;
    case Channel.Alpha:
      return 3;
    default:
      throw new Error("channel not found");
  }
};
