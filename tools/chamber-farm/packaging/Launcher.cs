using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

[assembly: AssemblyTitle("Chamber Farm")]
[assembly: AssemblyDescription("Chamber daily check-in and blackjack launcher")]
[assembly: AssemblyVersion("1.2.4.0")]

internal static class Launcher
{
    private const string PayloadHash = "__PAYLOAD_HASH__";
    private static readonly string ProjectDirectory = Encoding.UTF8.GetString(
        Convert.FromBase64String("__PROJECT_PATH_BASE64__"));
    [DllImport("kernel32.dll")] private static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);

    [STAThread]
    private static int Main(string[] args)
    {
        bool graphical = args.Length == 0 || (args.Length == 1 && args[0] == "--ui");
        if (graphical) ShowWindow(GetConsoleWindow(), 0);
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.InputEncoding = new UTF8Encoding(false);
        Console.Title = "Chamber Farm";
        int exitCode = 1;
        try
        {
            string dataDirectory = GetDataDirectory();
            string environmentFile = Path.Combine(dataDirectory, ".env");
            if (!File.Exists(environmentFile))
                throw new InvalidOperationException("Chưa có cấu hình .env trong: " + dataDirectory);

            string runtimeDirectory = EnsureRuntime();
            string nodeExecutable = Path.Combine(runtimeDirectory, "node.exe");
            string entryPoint = Path.Combine(runtimeDirectory, "app", graphical ? "ui-server.js" : "index.js");
            string arguments = Quote("--env-file=" + environmentFile) + " " + Quote(entryPoint);
            if (!graphical) foreach (string argument in args) arguments += " " + Quote(argument);

            var start = new ProcessStartInfo
            {
                FileName = nodeExecutable,
                Arguments = arguments,
                WorkingDirectory = dataDirectory,
                UseShellExecute = false,
                CreateNoWindow = graphical,
                RedirectStandardOutput = graphical,
                RedirectStandardError = graphical
            };
            start.EnvironmentVariables["CHAMBER_DATA_DIR"] = dataDirectory;
            // The child shares the console and receives Ctrl+C too. Let it finish
            // its current operation and preserve any unresolved stake on disk.
            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel = true; };
            using (Process process = Process.Start(start))
            {
                if (process == null) throw new InvalidOperationException("Không khởi động được bot.");
                bool opened = false;
                string lastError = "";
                if (graphical)
                {
                    process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        const string prefix = "CHAMBER_UI_URL=";
                        if (e.Data == null || !e.Data.StartsWith(prefix) || opened) return;
                        Uri address;
                        if (!Uri.TryCreate(e.Data.Substring(prefix.Length), UriKind.Absolute, out address) ||
                            address.Scheme != "http" || address.Host != "127.0.0.1") return;
                        try
                        {
                            Process.Start(new ProcessStartInfo { FileName = address.AbsoluteUri, UseShellExecute = true });
                            opened = true;
                        }
                        catch { lastError = "Không mở được trình duyệt mặc định. Hãy đặt Chrome hoặc Edge làm trình duyệt mặc định rồi mở lại."; }
                    };
                    process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
                    {
                        if (!String.IsNullOrEmpty(e.Data)) lastError = e.Data.Length > 1500 ? e.Data.Substring(0, 1500) : e.Data;
                    };
                    process.BeginOutputReadLine();
                    process.BeginErrorReadLine();
                }
                process.WaitForExit();
                exitCode = process.ExitCode;
                if (graphical && !opened)
                    MessageBox.Show(String.IsNullOrEmpty(lastError) ? "Không mở được bảng điều khiển. Hãy mở lại ChamberFarm.exe." : lastError,
                        "Chamber Farm", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
        catch (Exception error)
        {
            // This launcher never reads or logs the contents of .env.
            if (graphical) MessageBox.Show("Không mở được Chamber Farm: " + error.Message, "Chamber Farm", MessageBoxButtons.OK, MessageBoxIcon.Information);
            else Console.Error.WriteLine("Không mở được Chamber Farm: " + error.Message);
        }

        if (!graphical && args.Length == 0 && !Console.IsInputRedirected)
        {
            Console.WriteLine();
            Console.WriteLine("Bot đã dừng. Nhấn phím bất kỳ để đóng cửa sổ.");
            Console.ReadKey(true);
        }
        return exitCode;
    }

    private static string GetDataDirectory()
    {
        if (Directory.Exists(ProjectDirectory) && File.Exists(Path.Combine(ProjectDirectory, ".env")))
            return ProjectDirectory;

        string besideExecutable = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ChamberFarm-data");
        if (File.Exists(Path.Combine(besideExecutable, ".env"))) return besideExecutable;
        throw new InvalidOperationException("Không tìm thấy .env. Giải nén toàn bộ gói và đặt file .env trong thư mục ChamberFarm-data cạnh file .exe." +
            (String.IsNullOrEmpty(ProjectDirectory) ? "" : " Có thể dùng thư mục cấu hình gốc tại " + ProjectDirectory));
    }

    private static string EnsureRuntime()
    {
        string cacheRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ChamberFarm");
        string runtime = Path.Combine(cacheRoot, "runtime-" + PayloadHash.Substring(0, 20));
        string marker = Path.Combine(runtime, "ready.txt");
        using (var mutex = new Mutex(false, @"Local\ChamberFarm-" + PayloadHash.Substring(0, 20)))
        {
            bool acquired = false;
            try
            {
                try { acquired = mutex.WaitOne(TimeSpan.FromSeconds(90)); }
                catch (AbandonedMutexException) { acquired = true; }
                if (!acquired) throw new TimeoutException("Một phiên khác đang chuẩn bị bộ chạy. Thử lại sau.");
                if (File.Exists(marker) && File.ReadAllText(marker) == PayloadHash &&
                    File.Exists(Path.Combine(runtime, "node.exe")) && File.Exists(Path.Combine(runtime, "app", "index.js")))
                    return runtime;

                Console.WriteLine("Đang chuẩn bị bộ chạy Chamber Farm cho lần mở đầu tiên...");
                Directory.CreateDirectory(runtime);
                string allowedRoot = Path.GetFullPath(runtime) + Path.DirectorySeparatorChar;
                using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("ChamberFarm.Payload.zip"))
                {
                    if (payload == null) throw new InvalidOperationException("Thiếu dữ liệu bộ chạy trong file .exe.");
                    using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
                    {
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string output = Path.GetFullPath(Path.Combine(runtime, entry.FullName));
                            if (!output.StartsWith(allowedRoot, StringComparison.OrdinalIgnoreCase))
                                throw new InvalidDataException("Đường dẫn dữ liệu bộ chạy không hợp lệ.");
                            if (String.IsNullOrEmpty(entry.Name)) { Directory.CreateDirectory(output); continue; }
                            Directory.CreateDirectory(Path.GetDirectoryName(output));
                            using (Stream input = entry.Open())
                            using (Stream target = new FileStream(output, FileMode.Create, FileAccess.Write))
                                input.CopyTo(target);
                        }
                    }
                }
                File.WriteAllText(marker, PayloadHash, new UTF8Encoding(false));
                return runtime;
            }
            finally { if (acquired) mutex.ReleaseMutex(); }
        }
    }

    // Windows CommandLineToArgvW quoting. No command shell is involved.
    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') result.Append('\\', slashes * 2 + 1);
            else result.Append('\\', slashes);
            slashes = 0;
            result.Append(character);
        }
        result.Append('\\', slashes * 2);
        result.Append('"');
        return result.ToString();
    }
}
