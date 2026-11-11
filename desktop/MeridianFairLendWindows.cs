using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

namespace MeridianFairLendDesktop
{
    internal static class Program
    {
        private const string DefaultAppUrl = "https://meridian-fairlend-production.up.railway.app/?platform=windows";

        [STAThread]
        private static void Main(string[] args)
        {
            string targetUrl = DefaultAppUrl;
            if (args != null && args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
            {
                string candidate = args[0].Trim();
                if (candidate.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                    candidate.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
                {
                    targetUrl = candidate;
                }
            }

            try
            {
                string browserExe = FindChromiumBrowser();
                if (!string.IsNullOrEmpty(browserExe))
                {
                    string arguments = "--app=\"" + targetUrl + "\" --no-first-run --no-default-browser-check --class=MeridianFairLendAI";
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = browserExe,
                        Arguments = arguments,
                        UseShellExecute = false
                    };
                    Process.Start(psi);
                    return;
                }

                Process.Start(new ProcessStartInfo
                {
                    FileName = targetUrl,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Unable to launch Meridian FairLend AI Desktop.\n\nDetails: " + ex.Message + "\n\nPlease open: " + targetUrl,
                    "Meridian FairLend AI",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }

        private static string FindChromiumBrowser()
        {
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            List<string> candidates = new List<string>();

            if (!string.IsNullOrEmpty(pf))
            {
                candidates.Add(Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"));
                candidates.Add(Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
                candidates.Add(Path.Combine(pf, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"));
            }
            if (!string.IsNullOrEmpty(pf86))
            {
                candidates.Add(Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"));
                candidates.Add(Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"));
                candidates.Add(Path.Combine(pf86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"));
            }
            if (!string.IsNullOrEmpty(localApp))
            {
                candidates.Add(Path.Combine(localApp, "Google", "Chrome", "Application", "chrome.exe"));
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
