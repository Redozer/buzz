//! The macOS application menu.
//!
//! Buzz never called `Builder::menu()`, so Tauri installed `Menu::default()`
//! for us (`tauri::app::Builder::build`, macOS arm). That default puts a
//! `close_window` item in both the File and Window submenus, and muda gives
//! that item a Cmd+W key equivalent bound to `performClose:`.
//!
//! That default cannot express Buzz's context-dependent behavior:
//!
//! 1. `CloseRequested` on the main window is intercepted in `lib.rs` and turned
//!    into hide-to-tray. Cmd+W should take that path in normal Buzz mode.
//! 2. macOS resolves a menu key equivalent before the webview receives any key
//!    event, so Buzz Term could never bind Cmd+W to "close this terminal tab"
//!    while the accelerator was claimed here.
//!
//! So this module builds the standard menu minus both `close_window` items.
//! Everything else matches `Menu::default()` deliberately. The webview routes
//! Cmd+W conditionally instead: Buzz Term consumes it in capture phase while
//! it owns input, and `useCloseWindowShortcut` closes the current window in
//! normal Buzz mode.

#[cfg(target_os = "macos")]
use tauri::menu::{
    AboutMetadata, Menu, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID,
};
#[cfg(target_os = "macos")]
use tauri::AppHandle;
use tauri::{Builder, Runtime};

/// Installs Buzz's menu, replacing the `Menu::default()` Tauri would otherwise
/// auto-install. A no-op off macOS, where that default is never created and
/// the Cmd+W accelerator does not exist.
pub fn install<R: Runtime>(builder: Builder<R>) -> Builder<R> {
    #[cfg(target_os = "macos")]
    let builder = builder.menu(build);
    builder
}

/// Mirrors `Menu::default()` with every `close_window` item omitted.
///
/// The Window and Help submenus keep Tauri's well-known ids: `init_app_menu`
/// looks them up by id to call `set_as_windows_menu_for_nsapp` and
/// `set_as_help_menu_for_nsapp`, and a plain `with_items` submenu would skip
/// both silently -- no error, just a Window menu AppKit no longer manages.
#[cfg(target_os = "macos")]
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                pkg_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, Some("О Buzz"), Some(about_metadata))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, Some("Службы"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, Some("Скрыть Buzz"))?,
                    &PredefinedMenuItem::hide_others(app, Some("Скрыть остальные"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some("Завершить Buzz"))?,
                ],
            )?,
            // `Menu::default()`'s File submenu holds exactly one item on macOS
            // -- close_window -- so dropping that item drops the submenu too.
            &Submenu::with_items(
                app,
                "Правка",
                true,
                &[
                    &PredefinedMenuItem::undo(app, Some("Отменить"))?,
                    &PredefinedMenuItem::redo(app, Some("Повторить"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, Some("Вырезать"))?,
                    &PredefinedMenuItem::copy(app, Some("Копировать"))?,
                    &PredefinedMenuItem::paste(app, Some("Вставить"))?,
                    &PredefinedMenuItem::select_all(app, Some("Выбрать всё"))?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Вид",
                true,
                &[&PredefinedMenuItem::fullscreen(app, Some("Полноэкранный режим"))?],
            )?,
            &Submenu::with_id_and_items(
                app,
                WINDOW_SUBMENU_ID,
                "Окно",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, Some("Свернуть"))?,
                    &PredefinedMenuItem::maximize(app, Some("Развернуть"))?,
                ],
            )?,
            // Empty upstream too on macOS: About lives in the app submenu.
            &Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "Справка", true, &[])?,
        ],
    )
}
