/*
 * FocusLab permanent music library.
 *
 * Songs listed here are always available to every visitor — they
 * ship with the site itself, so they don't depend on the browser's
 * storage at all. They show up in the Focus Music panel alongside
 * anything a visitor adds with the "Add Music" button, and they
 * keep playing the exact same way (play/pause, keeps going across
 * pages and reloads).
 *
 * HOW TO ADD A PERMANENT SONG:
 *   1. Copy the audio file (mp3 or mp4) into this "music" folder
 *      (next to this manifest.js file).
 *   2. Add one line below with its file name and the title you
 *      want shown in the Focus Music list.
 *   3. Save this file — the song appears automatically, no other
 *      changes needed.
 *
 * HOW TO REMOVE ONE:
 *   Delete its line below (visitors can never remove a permanent
 *   song themselves — only songs they added with "Add Music" can
 *   be deleted from the site itself).
 *
 * Example:
 *   { file: "calm-piano.mp3", name: "Calm Piano" },
 */

const MUSIC_MANIFEST = [
{ file: "andriih-calm-calm-music-601652.mp3", name: "Andriih - Calm" },
    // { file: "your-file-name.mp3", name: "Title shown in the list" },

];
