/**
 * The ways out of the merge conflicts page for the merge started on workspace
 * `workspaceId`: the redirect when there is no such merge, the clear of the
 * merge when the page goes away, and the navigation that leaves it.
 *
 * Call it in setup before the page's first `await`. The unmount clear has to
 * be registered by then: if the user leaves, or the load fails, while that
 * load is pending, setup never resumes to register it.
 */
export function useMergeExit(workspaceId: number) {
  const mergeResult = useMergeResult();
  const router = useRouter();

  // The merge lives only in memory, so arriving here without one (a reload, a
  // bookmark, a direct link) leaves nothing to resolve. The id check matters as
  // much as the null check: the merge is held in one shared slot, so a merge
  // started on another workspace would otherwise render here and commit from
  // this URL, with the owner gate read off the wrong workspace.
  //
  // The redirect runs on mount, through the router rather than `navigateTo`:
  // `navigateTo` during setup neither aborts the rest of setup nor survives the
  // navigation still resolving this route, so it is dropped. Every read of
  // `mergeResult.value` in the page still needs its null check, because setup
  // finishes before the redirect happens. Until it lands, the page shows a "no
  // merge in progress" notice: the conflict view would read an empty list as
  // "All conflicts resolved" with Commit enabled.
  //
  const hasMergeForThisWorkspace = computed(() =>
    mergeResult.value !== null && mergeResult.value.workspaceIdA === workspaceId
  );

  if (!hasMergeForThisWorkspace.value) {
    onMounted(() => {
      router.replace(`/workspace/${workspaceId}/merge`).catch(() => {
        // The page's panel says there is no merge in progress, so a failed
        // redirect leaves the user somewhere they can act rather than stranded.
      });
    });
  }

  // The page's own exits clear the merge, but the back button and the header's
  // links leave without them. A merge left behind would be offered again on a
  // later visit, computed against data that has moved on. Only this workspace's
  // merge is cleared: one started for another workspace is not this page's to
  // drop.
  //
  onUnmounted(() => {
    if (mergeResult.value?.workspaceIdA === workspaceId) {
      setMergeResult(null);
    }
  });

  // Kept after the merge state is cleared, so a failed navigation still has
  // something to show and somewhere to send the user.
  const mergedWorkspaceId = ref<number>();

  // Set while the page navigates away after clearing the merge. Clearing it is
  // what makes the template fall through to the "no merge in progress" notice,
  // which would otherwise show through the route change and the out-in
  // transition every time the user commits, cancels or opens the editor.
  const leaving = ref(false);

  // Set only once the navigation to the merged workspace has actually failed.
  // The id alone is not the signal: it is known before the navigation, and the
  // page is still on screen while the router resolves and through the 300ms
  // out-in transition, so a panel driven by the id paints on every success.
  const navigationFailed = ref(false);

  /**
   * Clears the merge and navigates away. Resolves true when the navigation
   * failed: `navigateTo` resolves with a failure for an aborted navigation rather
   * than throwing, so its result is the only signal.
   */
  async function leaveMerge(to: Parameters<typeof navigateTo>[0]): Promise<boolean> {
    leaving.value = true;
    setMergeResult(null);

    try {
      const failed = !!await navigateTo(to);
      leaving.value = !failed;
      return failed;
    }
    catch (error) {
      leaving.value = false;
      throw error;
    }
  }

  return {
    hasMergeForThisWorkspace,
    mergedWorkspaceId,
    leaving,
    navigationFailed,
    leaveMerge
  };
}
