/*
|-------------------------------------------------------------------------------
| CUSTOM TYPES
|-------------------------------------------------------------------------------
*/

/**
 * A blog post with HTML content generated from Markdown, a URL path derived
 * from the filename, and a title derived from path and contents.
 */
export type GeneratedPost = {
  content: string;
  path: string;
  title: string;
};

/**
 * Template file contents. One template for normal blog pages and one for 404.
 */
export type ReadTemplateFiles = {
  pageTemplate: string;
  notFoundTemplate: string;
};

/**
 * Template file names and file contents.
 */
export type ReadSourceBlogFilenamesAndPosts = {
  srcPostFilenames: string[];
  srcPostContents: string[];
};
