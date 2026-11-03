/** Build-time values injected by electron-vite into the main process. */
interface ImportMetaEnv {
  /** Aptabase app key. Set in .env.local or the APTABASE_APP_KEY Actions secret; unset means no analytics. */
  readonly MAIN_VITE_APTABASE_KEY?: string;
}
