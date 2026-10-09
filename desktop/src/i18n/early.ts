// Подключается ПЕРВЫМ импортом в main.tsx: модули Buzz создают
// Intl-форматтеры при загрузке, патч должен успеть раньше них.
// WebView отдаёт navigator.language = en-US (в бандле только английская
// локализация), поэтому даты без явной локали форматировались по-английски.
// Подставляем ru-RU туда, где локаль не задана.
function defaultDatesToRussian() {
  const LOCALE = "ru-RU";
  const pick = (locales: unknown) => (locales === undefined || (Array.isArray(locales) && locales.length === 0) ? LOCALE : locales);
  const proto = Date.prototype as unknown as Record<string, (...a: unknown[]) => string>;
  for (const name of ["toLocaleString", "toLocaleDateString", "toLocaleTimeString"]) {
    const orig = proto[name];
    proto[name] = function (this: Date, locales?: unknown, options?: unknown) {
      return orig.call(this, pick(locales), options);
    };
  }
  const wrap = <T extends abstract new (...args: never[]) => unknown>(Ctor: T): T => {
    const Wrapped = function (this: unknown, locales?: unknown, options?: unknown) {
      return new (Ctor as unknown as new (l: unknown, o: unknown) => unknown)(pick(locales), options);
    } as unknown as T;
    Object.setPrototypeOf(Wrapped, Ctor);
    (Wrapped as unknown as { prototype: unknown }).prototype = Ctor.prototype;
    return Wrapped;
  };
  const intl = Intl as unknown as Record<string, unknown>;
  intl.DateTimeFormat = wrap(Intl.DateTimeFormat);
  intl.RelativeTimeFormat = wrap(Intl.RelativeTimeFormat);
}


function russianDisabled() {
  try {
    return window.localStorage.getItem("buzz-ui-lang") === "en";
  } catch {
    return false;
  }
}

if (typeof window !== "undefined" && !russianDisabled()) defaultDatesToRussian();
