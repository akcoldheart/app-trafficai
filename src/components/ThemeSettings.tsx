import { useState, useEffect } from 'react';
import { IconBrush, IconRotate, IconMoon, IconSun } from '@tabler/icons-react';

interface ThemeConfig {
  theme: string;
  'theme-base': string;
  'theme-font': string;
  'theme-primary': string;
  'theme-radius': string;
}

const defaultConfig: ThemeConfig = {
  theme: 'dark',
  'theme-base': 'stone',
  'theme-font': 'sans-serif',
  'theme-primary': 'pink',
  'theme-radius': '1',
};

const colors = [
  { name: 'violet', hex: '#9333ea' },
  { name: 'purple', hex: '#ae3ec9' },
  { name: 'indigo', hex: '#4263eb' },
  { name: 'blue', hex: '#066fd1' },
  { name: 'azure', hex: '#4299e1' },
  { name: 'pink', hex: '#d6336c' },
  { name: 'red', hex: '#d63939' },
  { name: 'orange', hex: '#f76707' },
  { name: 'yellow', hex: '#f59f00' },
  { name: 'lime', hex: '#74b816' },
  { name: 'green', hex: '#2fb344' },
  { name: 'teal', hex: '#0ca678' },
  { name: 'cyan', hex: '#17a2b8' },
];

const fonts = ['sans-serif', 'serif', 'monospace'];
const bases = ['purple', 'slate', 'gray', 'zinc', 'neutral', 'stone'];
const radiuses = ['0', '0.5', '1', '1.5', '2'];

export default function ThemeSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ThemeConfig>(defaultConfig);

  // Load saved settings on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedConfig = { ...defaultConfig };
    Object.keys(defaultConfig).forEach((key) => {
      const saved = localStorage.getItem(`tabler-${key}`);
      if (saved) {
        savedConfig[key as keyof ThemeConfig] = saved;
      }
    });
    setConfig(savedConfig);

    // Apply saved settings to document
    Object.entries(savedConfig).forEach(([key, value]) => {
      document.documentElement.setAttribute(`data-bs-${key}`, value);
    });
  }, []);

  const updateSetting = (key: keyof ThemeConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    document.documentElement.setAttribute(`data-bs-${key}`, value);
    localStorage.setItem(`tabler-${key}`, value);
  };

  const resetSettings = () => {
    Object.keys(defaultConfig).forEach((key) => {
      const value = defaultConfig[key as keyof ThemeConfig];
      document.documentElement.setAttribute(`data-bs-${key}`, value);
      localStorage.removeItem(`tabler-${key}`);
    });
    setConfig(defaultConfig);
  };

  const toggleTheme = () => {
    const newTheme = config.theme === 'light' ? 'dark' : 'light';
    updateSetting('theme', newTheme);
  };

  return (
    <>
      {/* Theme Toggle Button in Sidebar */}
      <div className="nav-item d-none d-lg-block">
        <button
          className="nav-link px-0 border-0 bg-transparent"
          onClick={toggleTheme}
          title={config.theme === 'light' ? 'Enable dark mode' : 'Enable light mode'}
        >
          {config.theme === 'light' ? (
            <IconMoon className="icon" />
          ) : (
            <IconSun className="icon" />
          )}
        </button>
      </div>

      {/* Floating Settings Button */}
      <div className="settings">
        <button
          className="btn btn-floating btn-icon btn-primary"
          onClick={() => setIsOpen(true)}
          title="Theme Settings"
        >
          <IconBrush className="icon" />
        </button>
      </div>

      {/* Offcanvas Settings Panel */}
      {isOpen && (
        <>
          <div
            className="offcanvas offcanvas-start offcanvas-narrow show"
            tabIndex={-1}
            style={{ visibility: 'visible' }}
          >
            <div className="offcanvas-header">
              <h2 className="offcanvas-title">Theme Settings</h2>
              <button
                type="button"
                className="btn-close"
                onClick={() => setIsOpen(false)}
              ></button>
            </div>
            <div className="offcanvas-body d-flex flex-column">
              <div>
                {/* Color Mode */}
                <div className="mb-4">
                  <label className="form-label">Color mode</label>
                  <p className="form-hint">Choose the color mode for your app.</p>
                  {['light', 'dark'].map((mode) => (
                    <label key={mode} className="form-check">
                      <div className="form-selectgroup-item">
                        <input
                          type="radio"
                          name="theme"
                          value={mode}
                          className="form-check-input"
                          checked={config.theme === mode}
                          onChange={() => updateSetting('theme', mode)}
                        />
                        <div className="form-check-label">
                          {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Color Scheme */}
                <div className="mb-4">
                  <label className="form-label">Color scheme</label>
                  <p className="form-hint">The perfect color mode for your app.</p>
                  <div className="row g-2">
                    {colors.map((color) => (
                      <div key={color.name} className="col-auto">
                        <label className="form-colorinput">
                          <input
                            name="theme-primary"
                            type="radio"
                            value={color.name}
                            className="form-colorinput-input"
                            checked={config['theme-primary'] === color.name}
                            onChange={() => updateSetting('theme-primary', color.name)}
                          />
                          <span
                            className="form-colorinput-color"
                            style={{ backgroundColor: color.hex }}
                          ></span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Font Family */}
                <div className="mb-4">
                  <label className="form-label">Font family</label>
                  <p className="form-hint">Choose the font family that fits your app.</p>
                  {fonts.map((font) => (
                    <label key={font} className="form-check">
                      <div className="form-selectgroup-item">
                        <input
                          type="radio"
                          name="theme-font"
                          value={font}
                          className="form-check-input"
                          checked={config['theme-font'] === font}
                          onChange={() => updateSetting('theme-font', font)}
                        />
                        <div className="form-check-label">
                          {font.charAt(0).toUpperCase() + font.slice(1)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Theme Base */}
                <div className="mb-4">
                  <label className="form-label">Theme base</label>
                  <p className="form-hint">Choose the gray shade for your app.</p>
                  {bases.map((base) => (
                    <label key={base} className="form-check">
                      <div className="form-selectgroup-item">
                        <input
                          type="radio"
                          name="theme-base"
                          value={base}
                          className="form-check-input"
                          checked={config['theme-base'] === base}
                          onChange={() => updateSetting('theme-base', base)}
                        />
                        <div className="form-check-label">
                          {base.charAt(0).toUpperCase() + base.slice(1)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Corner Radius */}
                <div className="mb-4">
                  <label className="form-label">Corner Radius</label>
                  <p className="form-hint">Choose the border radius factor for your app.</p>
                  {radiuses.map((radius) => (
                    <label key={radius} className="form-check">
                      <div className="form-selectgroup-item">
                        <input
                          type="radio"
                          name="theme-radius"
                          value={radius}
                          className="form-check-input"
                          checked={config['theme-radius'] === radius}
                          onChange={() => updateSetting('theme-radius', radius)}
                        />
                        <div className="form-check-label">{radius}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-auto space-y">
                <button type="button" className="btn w-100" onClick={resetSettings}>
                  <IconRotate className="icon" />
                  Reset changes
                </button>
                <button
                  className="btn btn-primary w-100"
                  onClick={() => setIsOpen(false)}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx global>{`
        .settings {
          position: fixed;
          right: 1rem;
          bottom: 1rem;
          z-index: 1040;
        }

        .btn-floating {
          width: 3rem;
          height: 3rem;
          border-radius: 50%;
          box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
        }

        .offcanvas-narrow {
          width: 320px;
        }

        .offcanvas.show {
          transform: none;
        }

        .offcanvas-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          z-index: 1030;
          width: 100vw;
          height: 100vh;
          background-color: rgba(24, 36, 51, 0.24);
          pointer-events: auto;
        }

        .page-header .dropdown {
          position: relative;
          z-index: 1060;
        }

        .page-header .dropdown-menu {
          z-index: 1070 !important;
        }

        .form-colorinput {
          position: relative;
          display: inline-block;
          margin: 0;
          cursor: pointer;
        }

        .form-colorinput-input {
          position: absolute;
          z-index: -1;
          opacity: 0;
        }

        .form-colorinput-color {
          display: block;
          width: 1.5rem;
          height: 1.5rem;
          border-radius: 50%;
          border: 2px solid transparent;
          box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1);
          transition: border-color 0.15s ease-in-out;
        }

        .form-colorinput-input:checked ~ .form-colorinput-color {
          border-color: var(--tblr-primary);
          box-shadow: 0 0 0 2px var(--tblr-primary);
        }

        .form-colorinput-input:focus ~ .form-colorinput-color {
          box-shadow: 0 0 0 2px var(--tblr-primary);
        }

        .space-y > * + * {
          margin-top: 0.5rem;
        }

        /* Hide theme-specific elements */
        [data-bs-theme="dark"] .hide-theme-dark {
          display: none !important;
        }

        [data-bs-theme="light"] .hide-theme-light {
          display: none !important;
        }
      `}</style>
    </>
  );
}
