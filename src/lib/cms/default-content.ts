import type { PortfolioDocument } from "./content";

// The current source paragraph is also the explicit, CMS-disabled fallback.
export const defaultDocument: PortfolioDocument = {
  version: 1,
  segments: [
    { text: "A young media strategist fascinated by what makes audiences watch, click, and act. " },
    { text: "TVM President.", linkId: "tvm" },
    { text: " " },
    { text: "Post-Credits Editor-in-Chief.", linkId: "post-credits" },
    { text: " " },
    { text: "MWS Social media manager.", linkId: "mws" },
  ],
  links: [
    {
      id: "tvm", href: "https://www.tvmtelevision.com/", title: "TVM: Student Television at McGill",
      summary: "McGill’s student-run television and film organisation, led by Anya as President.",
      image: { kind: "bundled", id: "tvm" }, imageAlt: "TVM logo",
    },
    {
      id: "post-credits", href: "https://www.tvmtelevision.com/post-credits", title: "Post-Credits",
      summary: "TVM’s film magazine, edited by Anya as Editor-in-Chief.",
      image: { kind: "bundled", id: "post-credits" }, imageAlt: "Post-Credits magazine cover",
    },
    {
      id: "mws", href: "https://www.instagram.com/mcgillwinesociety/", title: "McGill Wine Society",
      summary: "McGill Wine Society’s Instagram, managed by Anya.", image: null, imageAlt: "",
    },
  ],
};
