import { ViewContainerRef, inject, type Type } from '@angular/core';
import { ModalDialogParams, ModalDialogService } from '@nativescript/angular';
import { Device, isAndroid, isIOS, View } from '@nativescript/core';

import { isLightTheme } from '../core/settings.service';

/**
 * Base of the modals: the context they are opened with, the theme class (a modal is not a child of
 * the root view, so it does not inherit it) and the way out. The template's root calls
 * `dockToBottom` (bottom sheets) or `avoidKeyboard` (full-screen forms) from its `loaded` event.
 */
export abstract class BottomSheet<C = void, R = void> {
  private readonly params = inject(ModalDialogParams);
  protected readonly context = this.params.context as C;
  readonly themeClass = isLightTheme() ? 'ns-light' : 'ns-dark';
  readonly dockToBottom = dockToBottom;
  readonly avoidKeyboard = avoidKeyboard;

  chip(active: boolean): string {
    return active ? 'chip chip-active' : 'chip';
  }

  /** Closes the sheet; the opener receives `result` (`undefined` when the sheet is dismissed). */
  close(result?: R): void {
    this.params.closeCallback(result);
  }
}

/**
 * Returns a function that opens a modal over the calling component and resolves to its result:
 * a bottom sheet, or a full-screen form with `fullscreen`. Must be called from an injection
 * context (a field initializer, for instance).
 */
export function injectSheetOpener(): <C, R>(sheet: Type<BottomSheet<C, R>>, context: C, fullscreen?: boolean) => Promise<R | undefined> {
  const modal = inject(ModalDialogService);
  const viewContainerRef = inject(ViewContainerRef);
  return (sheet, context, fullscreen = false) => modal.showModal(sheet, {
    viewContainerRef,
    context,
    fullscreen,
    // iOS shows a page sheet; Android is docked by `dockToBottom`.
    ios: isIOS && !fullscreen ? { presentationStyle: UIModalPresentationStyle.PageSheet } : undefined,
  });
}

/** iOS: calls `onChange` with the height of the keyboard (0 once hidden) until `view` is unloaded. */
function observeIosKeyboard(view: View, onChange: (height: number) => void): void {
  const center = NSNotificationCenter.defaultCenter;
  const observe = (name: string, visible: boolean) => center.addObserverForNameObjectQueueUsingBlock(
    name, null, NSOperationQueue.mainQueue, (notification: NSNotification) => {
      const frame = (notification.userInfo?.objectForKey(UIKeyboardFrameEndUserInfoKey) as NSValue | undefined)?.CGRectValue;
      onChange(visible && frame ? frame.size.height : 0);
    });
  const observers = [observe(UIKeyboardWillShowNotification, true), observe(UIKeyboardWillHideNotification, false)];
  view.once(View.unloadedEvent, () => observers.forEach((observer) => center.removeObserver(observer)));
}

/** iOS: sizes the page sheet to its content (custom detent on iOS 16+, medium detent on iOS 15). */
function fitIosSheetToContent(view: View): void {
  const controller = (view as unknown as { viewController?: UIViewController }).viewController;
  const content = (view as unknown as { getChildAt(index: number): View | undefined }).getChildAt(0);
  const sheet = controller?.presentationController as UISheetPresentationController | undefined;
  if (!controller || !content || !sheet || typeof sheet.detents === 'undefined') return;

  if (parseFloat(Device.osVersion) < 16) {
    sheet.detents = NSArray.arrayWithObject(UISheetPresentationControllerDetent.mediumDetent());
    return;
  }

  let height = 0;
  let keyboard = 0;
  let lift = 0;
  let contentHeight = 0;
  content.verticalAlignment = 'bottom';
  const detent = UISheetPresentationControllerDetent.customDetentWithIdentifierResolver('content', (context) =>
    Math.min(height || context.maximumDetentValue, context.maximumDetentValue),
  );
  sheet.detents = NSArray.arrayWithObject(detent);
  sheet.selectedDetentIdentifier = 'content';

  // A sheet does not rise with the keyboard: the detent grows by the keyboard height and the
  // content is lifted by the same amount, so it ends up right above the keyboard.
  const update = (): void => {
    const bottomInset = controller.view?.safeAreaInsets?.bottom ?? 0;
    const nextLift = keyboard > 0 ? Math.max(0, keyboard - bottomInset) : 0;
    if (nextLift !== lift) {
      lift = nextLift;
      content.marginBottom = lift;
    }
    // While lifted the available height is that of the previous detent: keep the natural height.
    if (lift === 0) contentHeight = content.getActualSize().height;
    const next = Math.ceil(contentHeight + lift + bottomInset);
    if (contentHeight > 0 && next !== height) {
      height = next;
      sheet.invalidateDetents();
    }
  };
  observeIosKeyboard(view, (height) => {
    keyboard = height;
    update();
  });
  content.on(View.layoutChangedEvent, update);
  view.once(View.unloadedEvent, () => content.off(View.layoutChangedEvent, update));
  update();
}

/**
 * Full-screen form: keeps its bottom edge above the keyboard, so the body (a ScrollView) shrinks
 * instead of going behind it. iOS lifts the content by the keyboard height; Android resizes the window.
 */
function avoidKeyboard(view: View): void {
  if (isIOS) {
    const content = (view as unknown as { getChildAt(index: number): View | undefined }).getChildAt(0);
    const controller = (view as unknown as { viewController?: UIViewController }).viewController;
    if (!content) return;
    observeIosKeyboard(view, (keyboard) => {
      const bottomInset = controller?.view?.safeAreaInsets?.bottom ?? 0;
      content.marginBottom = keyboard > 0 ? Math.max(0, keyboard - bottomInset) : 0;
    });
    return;
  }
  if (!isAndroid) return;
  const apply = (): boolean => {
    const dialog = (view as unknown as { _dialogFragment?: { getDialog(): android.app.Dialog | null } })._dialogFragment?.getDialog();
    const window = dialog?.getWindow();
    if (!window) return false;
    window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    return true;
  };
  if (!apply()) setTimeout(apply, 50);
}

/**
 * Makes the modal a bottom sheet fitted to its content. Android: full width, glued to the bottom edge,
 * over a transparent window so the rounded top corners show, and resized when the keyboard opens.
 */
function dockToBottom(view: View): void {
  if (isIOS) {
    fitIosSheetToContent(view);
    return;
  }
  if (!isAndroid) return;
  const apply = (): boolean => {
    const dialog = (view as unknown as { _dialogFragment?: { getDialog(): android.app.Dialog | null } })._dialogFragment?.getDialog();
    const window = dialog?.getWindow();
    if (!window) return false;
    window.setGravity(android.view.Gravity.BOTTOM);
    window.setLayout(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT);
    window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
    window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
    return true;
  };
  if (!apply()) setTimeout(apply, 50);
}
