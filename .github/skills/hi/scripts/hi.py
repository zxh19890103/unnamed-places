import subprocess
import sys

def speak_hi() -> None:
	message = "Hi, I need your help!"
	try:
		subprocess.run(["say", message], check=True)
	except FileNotFoundError:
		print("Error: macOS 'say' command is not available on this system.", file=sys.stderr)
		raise SystemExit(1)
	except subprocess.CalledProcessError as exc:
		print(f"Error: failed to play speech (exit code {exc.returncode}).", file=sys.stderr)
		raise SystemExit(exc.returncode)

if __name__ == "__main__":
	speak_hi()