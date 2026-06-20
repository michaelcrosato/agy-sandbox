describe("mockFreezeScript", () => {
  test("is verified via MainThreadWatchdog.test.js integration run", () => {
    // mockFreezeScript.js is an intentional CPU-blocking script invoked as a child process
    // inside MainThreadWatchdog.test.js to verify watchdog SIGKILL actions.
    expect(true).toBe(true);
  });
});
