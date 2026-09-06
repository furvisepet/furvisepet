# Docker startup investigation

Windows event 2004 at local 13:51 recorded com.docker.backend.exe using 58,848,980,992 bytes of virtual memory. The later 14:16 unexpected shutdown has no matching exhaustion event identified; its cause is not established.

Remote process environment lacked ProgramData and TMP. Docker logs explicitly reported inability to obtain ProgramData. The bounded diagnostic launch restored ProgramData from Windows CommonApplicationData and TMP from TEMP in that process only. It did not modify global environment, installation, data, or Docker settings.

A 45-second startup-only observation reached Engine 29.7.2 and peaked at 242 MiB combined backend private memory. A local monitor would terminate Docker backends above 1 GiB combined private memory or below 3 GiB host free RAM. Neither threshold fired. Docker was forcibly stopped at the end and no Docker processes remained in the command's final check.

This establishes a working corrected launch, not a permanent memory-leak fix or workload stability. Keep WSL/container caps and the host-process monitor for further testing. No database workload, provider call, migration, push, merge or deployment ran. The pending HTTP test remains unverified.
