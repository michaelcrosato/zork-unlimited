param(
  [Parameter(Mandatory = $true)]
  [int]$AnchorPid,

  [Parameter(Mandatory = $true)]
  [string]$ExecutableBase64,

  [Parameter(Mandatory = $true)]
  [string]$CommandLineBase64,

  [Parameter(Mandatory = $true)]
  [string]$ControlPipe,

  [Parameter(Mandatory = $true)]
  [string]$TerminationFileBase64
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class CodexBlindJob {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IO_COUNTERS {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_LIMIT_INFORMATION {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalPageFaultCount;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION information,
        uint informationLength
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool QueryInformationJobObject(
        IntPtr job,
        int informationClass,
        out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION information,
        uint informationLength,
        IntPtr returnLength
    );

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        IntPtr processAttributes,
        IntPtr threadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation
    );

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint desiredAccess, bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr GetStdHandle(int standardHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool CloseHandle(IntPtr handle);
}
'@

function Last-Win32Error([string]$Operation) {
  return "$Operation failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
}

function Write-Control($Writer, $Value) {
  $Writer.WriteLine(($Value | ConvertTo-Json -Compress))
}

$pipe = $null
$writer = $null
$job = [IntPtr]::Zero
$anchor = [IntPtr]::Zero
$processInformation = New-Object CodexBlindJob+PROCESS_INFORMATION
$providerAssigned = $false
$treeTerminated = $false
try {
  $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(
    ".",
    $ControlPipe,
    [System.IO.Pipes.PipeDirection]::Out,
    [System.IO.Pipes.PipeOptions]::Asynchronous
  )
  $pipe.Connect(5000)
  $writer = New-Object System.IO.StreamWriter($pipe)
  $writer.AutoFlush = $true
  $terminationFile = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String($TerminationFileBase64)
  )

  $job = [CodexBlindJob]::CreateJobObject([IntPtr]::Zero, $null)
  if ($job -eq [IntPtr]::Zero) {
    throw (Last-Win32Error "CreateJobObject")
  }
  $limits = New-Object CodexBlindJob+JOBOBJECT_EXTENDED_LIMIT_INFORMATION
  $limits.BasicLimitInformation.LimitFlags = 0x00002000
  $limitSize = [Runtime.InteropServices.Marshal]::SizeOf($limits)
  if (-not [CodexBlindJob]::SetInformationJobObject($job, 9, [ref]$limits, $limitSize)) {
    throw (Last-Win32Error "SetInformationJobObject")
  }
  $anchor = [CodexBlindJob]::OpenProcess(0x00100000, $false, [uint32]$AnchorPid)
  if ($anchor -eq [IntPtr]::Zero) {
    throw (Last-Win32Error "OpenProcess")
  }

  $executable = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ExecutableBase64))
  $commandLine = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($CommandLineBase64))
  $startup = New-Object CodexBlindJob+STARTUPINFO
  $startup.cb = [Runtime.InteropServices.Marshal]::SizeOf($startup)
  $startup.dwFlags = 0x00000100
  $startup.hStdInput = [CodexBlindJob]::GetStdHandle(-10)
  $startup.hStdOutput = [CodexBlindJob]::GetStdHandle(-11)
  $startup.hStdError = [CodexBlindJob]::GetStdHandle(-12)
  $mutableCommandLine = New-Object Text.StringBuilder($commandLine)
  if (
    -not [CodexBlindJob]::CreateProcess(
      $executable,
      $mutableCommandLine,
      [IntPtr]::Zero,
      [IntPtr]::Zero,
      $true,
      0x00000004,
      [IntPtr]::Zero,
      (Get-Location).Path,
      [ref]$startup,
      [ref]$processInformation
    )
  ) {
    throw (Last-Win32Error "CreateProcess")
  }
  if (
    -not [CodexBlindJob]::AssignProcessToJobObject(
      $job,
      $processInformation.hProcess
    )
  ) {
    [void][CodexBlindJob]::TerminateProcess($processInformation.hProcess, 1)
    throw (Last-Win32Error "AssignProcessToJobObject")
  }
  $providerAssigned = $true
  if ([CodexBlindJob]::ResumeThread($processInformation.hThread) -eq 0xffffffff) {
    throw (Last-Win32Error "ResumeThread")
  }
  Write-Control $writer @{ type = "custody_ready" }

  $providerReported = $false
  while (-not $treeTerminated) {
    $anchorWait = [CodexBlindJob]::WaitForSingleObject($anchor, 0)
    if ($anchorWait -ne 0 -and $anchorWait -ne 258) {
      throw (Last-Win32Error "WaitForSingleObject")
    }
    if (
      $anchorWait -eq 0 -or
      (Test-Path -LiteralPath $terminationFile -PathType Leaf)
    ) {
      if (-not [CodexBlindJob]::TerminateJobObject($job, 1)) {
        throw (Last-Win32Error "TerminateJobObject")
      }
      $deadline = [DateTime]::UtcNow.AddSeconds(2)
      do {
        $accounting = New-Object CodexBlindJob+JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
        $accountingSize = [Runtime.InteropServices.Marshal]::SizeOf($accounting)
        if (
          -not [CodexBlindJob]::QueryInformationJobObject(
            $job,
            1,
            [ref]$accounting,
            $accountingSize,
            [IntPtr]::Zero
          )
        ) {
          throw (Last-Win32Error "QueryInformationJobObject")
        }
        if ($accounting.ActiveProcesses -eq 0) {
          $treeTerminated = $true
          break
        }
        Start-Sleep -Milliseconds 25
      } while ([DateTime]::UtcNow -lt $deadline)
      if (-not $treeTerminated) {
        throw "Windows process job remained active after forced termination"
      }
      Write-Control $writer @{ type = "tree_terminated" }
      break
    }

    if (-not $providerReported) {
      $wait = [CodexBlindJob]::WaitForSingleObject($processInformation.hProcess, 50)
      if ($wait -eq 0) {
        [uint32]$exitCode = 1
        if (
          -not [CodexBlindJob]::GetExitCodeProcess(
            $processInformation.hProcess,
            [ref]$exitCode
          )
        ) {
          throw (Last-Win32Error "GetExitCodeProcess")
        }
        Write-Control $writer @{
          type = "provider_exit"
          code = [long]$exitCode
          signal = $null
        }
        $providerReported = $true
      }
      elseif ($wait -ne 258) {
        throw (Last-Win32Error "WaitForSingleObject")
      }
    }
    else {
      Start-Sleep -Milliseconds 25
    }
  }
}
catch {
  if ($null -ne $writer) {
    try {
      Write-Control $writer @{ type = "anchor_error"; message = $_.Exception.Message }
    }
    catch {
      # The fail-closed job cleanup below remains authoritative.
    }
  }
  exit 1
}
finally {
  if ($job -ne [IntPtr]::Zero) {
    if ($providerAssigned -and -not $treeTerminated) {
      [void][CodexBlindJob]::TerminateJobObject($job, 1)
    }
    [void][CodexBlindJob]::CloseHandle($job)
  }
  if ($anchor -ne [IntPtr]::Zero) {
    [void][CodexBlindJob]::CloseHandle($anchor)
  }
  if ($processInformation.hThread -ne [IntPtr]::Zero) {
    [void][CodexBlindJob]::CloseHandle($processInformation.hThread)
  }
  if ($processInformation.hProcess -ne [IntPtr]::Zero) {
    [void][CodexBlindJob]::CloseHandle($processInformation.hProcess)
  }
  if ($null -ne $writer) {
    $writer.Dispose()
  }
  if ($null -ne $pipe) {
    $pipe.Dispose()
  }
}
