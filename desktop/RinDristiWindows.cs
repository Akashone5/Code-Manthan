using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace RinDristiDesktop
{
    internal static class NativeMethods
    {
        [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern int SetCurrentProcessExplicitAppUserModelID(string appID);

        [DllImport("user32.dll", SetLastError = true)]
        internal static extern bool SetProcessDPIAware();

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern IntPtr LoadLibrary(string lpFileName);
    }

    internal static class Program
    {
        private const string DefaultAppUrl = "https://rindristi-fairlend-production.up.railway.app/?platform=windows";
        private static readonly Dictionary<string, Assembly> LoadedAssemblies = new Dictionary<string, Assembly>(StringComparer.OrdinalIgnoreCase);

        [STAThread]
        private static int Main(string[] args)
        {
            try
            {
                NativeMethods.SetProcessDPIAware();
            }
            catch
            {
            }

            try
            {
                NativeMethods.SetCurrentProcessExplicitAppUserModelID("com.rindristi.desktop");
            }
            catch
            {
            }

            RegisterEmbeddedResolvers();

            bool smokeTest = false;
            string targetUrl = DefaultAppUrl;

            if (args != null)
            {
                foreach (string rawArg in args)
                {
                    if (string.IsNullOrWhiteSpace(rawArg))
                    {
                        continue;
                    }
                    string candidate = rawArg.Trim();
                    if (string.Equals(candidate, "--smoke-test", StringComparison.OrdinalIgnoreCase))
                    {
                        smokeTest = true;
                        continue;
                    }
                    if (candidate.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                        candidate.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                    {
                        targetUrl = candidate;
                    }
                }
            }

            if (smokeTest)
            {
                return RunSmokeCheck();
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                using (MainForm form = new MainForm(targetUrl))
                {
                    Application.Run(form);
                }
                return 0;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Unable to launch RinDristi FairLend AI Desktop.\n\nDetails: " + ex.Message + "\n\nPlease open: " + targetUrl,
                    "RinDristi FairLend AI",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
                return 1;
            }
        }

        private static void RegisterEmbeddedResolvers()
        {
            AppDomain.CurrentDomain.AssemblyResolve += delegate(object sender, ResolveEventArgs resolveArgs)
            {
                string simpleName = new AssemblyName(resolveArgs.Name).Name;
                Assembly cached;
                if (LoadedAssemblies.TryGetValue(simpleName, out cached))
                {
                    return cached;
                }

                string resourceName = simpleName + ".dll";
                Assembly self = Assembly.GetExecutingAssembly();
                using (Stream stream = self.GetManifestResourceStream(resourceName))
                {
                    if (stream == null)
                    {
                        return null;
                    }
                    byte[] raw = ReadFully(stream);
                    Assembly loaded = Assembly.Load(raw);
                    LoadedAssemblies[simpleName] = loaded;
                    return loaded;
                }
            };

            EnsureNativeWebView2Loader();
        }

        private static void EnsureNativeWebView2Loader()
        {
            string arch = IntPtr.Size == 8 ? "x64" : "x86";
            string resourceName = "WebView2Loader." + arch + ".dll";
            Assembly self = Assembly.GetExecutingAssembly();
            using (Stream stream = self.GetManifestResourceStream(resourceName))
            {
                if (stream == null)
                {
                    return;
                }

                string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string binDir = Path.Combine(localApp, "RinDristiAI", "bin", arch);
                Directory.CreateDirectory(binDir);
                string dllPath = Path.Combine(binDir, "WebView2Loader.dll");

                byte[] bytes = ReadFully(stream);
                bool needsWrite = !File.Exists(dllPath) || new FileInfo(dllPath).Length != bytes.Length;
                if (needsWrite)
                {
                    try
                    {
                        File.WriteAllBytes(dllPath, bytes);
                    }
                    catch
                    {
                    }
                }

                if (File.Exists(dllPath))
                {
                    NativeMethods.LoadLibrary(dllPath);
                }
            }
        }

        private static byte[] ReadFully(Stream input)
        {
            using (MemoryStream ms = new MemoryStream())
            {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = input.Read(buffer, 0, buffer.Length)) > 0)
                {
                    ms.Write(buffer, 0, read);
                }
                return ms.ToArray();
            }
        }

        private static int RunSmokeCheck()
        {
            try
            {
                string ver = WebView2Probe.GetRuntimeVersion();
                return string.IsNullOrEmpty(ver) ? 2 : 0;
            }
            catch
            {
                return 2;
            }
        }
    }

    internal static class WebView2Probe
    {
        internal static string GetRuntimeVersion()
        {
            return CoreWebView2Environment.GetAvailableBrowserVersionString(null);
        }
    }

    internal sealed class MainForm : Form
    {
        private readonly string _targetUrl;
        private readonly WebView2 _webView;
        private bool _fallbackTriggered;

        internal MainForm(string targetUrl)
        {
            _targetUrl = targetUrl;
            _fallbackTriggered = false;

            Text = "RinDristi FairLend AI";
            Width = 1320;
            Height = 840;
            MinimumSize = new Size(920, 620);
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(6, 78, 59);

            try
            {
                Icon appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (appIcon != null)
                {
                    Icon = appIcon;
                }
            }
            catch
            {
            }

            _webView = new WebView2();
            _webView.Dock = DockStyle.Fill;
            _webView.DefaultBackgroundColor = Color.FromArgb(247, 243, 235);
            Controls.Add(_webView);
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            InitializeWebViewAsync();
        }

        private void InitializeWebViewAsync()
        {
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string userDataDir = Path.Combine(localApp, "RinDristiAI", "WebView2Data");
            try
            {
                Directory.CreateDirectory(userDataDir);
            }
            catch
            {
            }

            TaskScheduler uiScheduler = TaskScheduler.FromCurrentSynchronizationContext();

            try
            {
                string runtimeVersion = CoreWebView2Environment.GetAvailableBrowserVersionString(null);
                if (string.IsNullOrEmpty(runtimeVersion))
                {
                    TriggerIsolatedFallback();
                    return;
                }
            }
            catch
            {
                TriggerIsolatedFallback();
                return;
            }

            _webView.CoreWebView2InitializationCompleted += OnCoreWebView2InitializationCompleted;

            CoreWebView2Environment.CreateAsync(null, userDataDir, null).ContinueWith(delegate(Task<CoreWebView2Environment> envTask)
            {
                if (IsDisposed || Disposing)
                {
                    return;
                }
                if (envTask.IsFaulted || envTask.IsCanceled || envTask.Result == null)
                {
                    TriggerIsolatedFallback();
                    return;
                }
                try
                {
                    _webView.EnsureCoreWebView2Async(envTask.Result);
                }
                catch
                {
                    TriggerIsolatedFallback();
                }
            }, uiScheduler);
        }

        private void OnCoreWebView2InitializationCompleted(object sender, CoreWebView2InitializationCompletedEventArgs e)
        {
            if (IsDisposed || Disposing)
            {
                return;
            }
            if (!e.IsSuccess || _webView.CoreWebView2 == null)
            {
                TriggerIsolatedFallback();
                return;
            }

            CoreWebView2 core = _webView.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = true;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.IsBuiltInErrorPageEnabled = false;
            core.Settings.AreDefaultScriptDialogsEnabled = true;
            core.Settings.IsZoomControlEnabled = true;
            core.Settings.IsSwipeNavigationEnabled = true;

            core.NewWindowRequested += OnNewWindowRequested;
            core.NavigationCompleted += OnNavigationCompleted;
            core.DocumentTitleChanged += OnDocumentTitleChanged;

            _webView.Source = new Uri(_targetUrl);
        }

        private void OnDocumentTitleChanged(object sender, object args)
        {
            if (_webView.CoreWebView2 != null && !string.IsNullOrWhiteSpace(_webView.CoreWebView2.DocumentTitle))
            {
                Text = _webView.CoreWebView2.DocumentTitle;
            }
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            string uri = e.Uri ?? string.Empty;
            e.Handled = true;
            if (string.IsNullOrWhiteSpace(uri))
            {
                return;
            }

            try
            {
                Uri requested = new Uri(uri);
                Uri home = new Uri(_targetUrl);
                if (string.Equals(requested.Host, home.Host, StringComparison.OrdinalIgnoreCase) &&
                    !requested.AbsolutePath.StartsWith("/docs", StringComparison.OrdinalIgnoreCase))
                {
                    _webView.CoreWebView2.Navigate(uri);
                    return;
                }
                Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
            }
            catch
            {
            }
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (e.IsSuccess || _webView.CoreWebView2 == null)
            {
                return;
            }
            if (e.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled ||
                e.WebErrorStatus == CoreWebView2WebErrorStatus.ConnectionAborted)
            {
                return;
            }
            _webView.NavigateToString(BuildOfflineRetryHtml(_targetUrl));
        }

        private static string BuildOfflineRetryHtml(string retryUrl)
        {
            string safeUrl = retryUrl.Replace("&", "&amp;").Replace("\"", "&quot;").Replace("<", "&lt;").Replace(">", "&gt;");
            return "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                + "<title>RinDristi FairLend AI</title>"
                + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F7F3EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#112A22;}"
                + ".card{max-width:440px;margin:24px;background:#fff;border:2px solid #064E3B;border-radius:16px;padding:30px;text-align:center;box-shadow:0 12px 32px rgba(6,78,59,.14);}"
                + ".badge{display:inline-flex;width:54px;height:54px;border-radius:14px;background:#064E3B;color:#F8E7C9;align-items:center;justify-content:center;font-weight:900;font-size:26px;margin-bottom:14px;}"
                + "h2{margin:0 0 10px;color:#064E3B;font-size:20px;}p{margin:0 0 20px;color:#4B6359;font-size:14px;line-height:1.5;}"
                + "a.btn{display:inline-block;background:#064E3B;color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;}"
                + "</style></head><body><div class=\"card\"><div class=\"badge\">R</div>"
                + "<h2>Unable to Connect</h2>"
                + "<p>RinDristi FairLend AI could not reach the cloud server. Please check your internet connection and retry.</p>"
                + "<a class=\"btn\" href=\"" + safeUrl + "\">Retry Connection</a></div></body></html>";
        }

        private void TriggerIsolatedFallback()
        {
            if (_fallbackTriggered)
            {
                return;
            }
            _fallbackTriggered = true;

            try
            {
                string edgeExe = FindEdgeExecutable();
                if (!string.IsNullOrEmpty(edgeExe))
                {
                    string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    string profileDir = Path.Combine(localApp, "RinDristiAI", "IsolatedEdgeProfile");
                    Directory.CreateDirectory(profileDir);
                    string arguments = "--app=\"" + _targetUrl + "\" --user-data-dir=\"" + profileDir + "\" --new-window --no-first-run --no-default-browser-check --class=RinDristiAI";
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edgeExe,
                        Arguments = arguments,
                        UseShellExecute = false
                    });
                    Close();
                    return;
                }
            }
            catch
            {
            }

            MessageBox.Show(
                "Microsoft Edge WebView2 Runtime is required to run RinDristi FairLend AI Desktop.\n\nPlease install WebView2 Runtime or visit:\n" + _targetUrl,
                "RinDristi FairLend AI",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning
            );
            Close();
        }

        private static string FindEdgeExecutable()
        {
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            List<string> candidates = new List<string>();
            if (!string.IsNullOrEmpty(pf86))
            {
                candidates.Add(Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"));
            }
            if (!string.IsNullOrEmpty(pf))
            {
                candidates.Add(Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
            }
            if (!string.IsNullOrEmpty(localApp))
            {
                candidates.Add(Path.Combine(localApp, "Microsoft", "Edge", "Application", "msedge.exe"));
            }
            foreach (string path in candidates)
            {
                if (!string.IsNullOrEmpty(path) && File.Exists(path))
                {
                    return path;
                }
            }
            return null;
        }
    }
}
