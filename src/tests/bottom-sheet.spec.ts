import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalDialogParams, ModalDialogService } from '@nativescript/angular';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BottomSheet, injectSheetOpener } from '~/app/shared/bottom-sheet';
import { Device, View, makeRootView, nsState, setPlatform } from './stubs/nativescript-core';

const scope = globalThis as unknown as Record<string, unknown>;

/** The Android dialog window the sheet configures. */
const makeWindow = () => ({
  setGravity: vi.fn(), setLayout: vi.fn(), setBackgroundDrawable: vi.fn(), setSoftInputMode: vi.fn(),
});

const androidView = (window: ReturnType<typeof makeWindow> | null): any => {
  const view = new View();
  Object.assign(view, { _dialogFragment: { getDialog: () => (window ? { getWindow: () => window } : null) } });
  return view;
};

class Sheet extends BottomSheet<{ id: number }, string> {
  readonly id = this.context.id;
}

@Component({ template: '' })
class Opener {
  readonly open = injectSheetOpener();
}

describe('BottomSheet', () => {
  it('exposes the context, the theme and closes with a result', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({ providers: [Sheet, { provide: ModalDialogParams, useValue: new ModalDialogParams({ id: 7 }, close) }] });
    const sheet = TestBed.inject(Sheet);
    expect(sheet.id).toBe(7);
    expect(sheet.themeClass).toBe('ns-dark');
    expect(sheet.chip(true)).toBe('chip chip-active');
    expect(sheet.chip(false)).toBe('chip');
    sheet.close('done');
    expect(close).toHaveBeenCalledWith('done');
    sheet.close();
    expect(close).toHaveBeenLastCalledWith(undefined);
  });

  it('follows the light theme', () => {
    nsState.rootView = makeRootView();
    nsState.rootView.cssClasses.add('ns-light');
    TestBed.configureTestingModule({ providers: [Sheet, { provide: ModalDialogParams, useValue: new ModalDialogParams({ id: 1 }, () => undefined) }] });
    expect(TestBed.inject(Sheet).themeClass).toBe('ns-light');
  });

  describe('injectSheetOpener', () => {
    it('opens the sheet as a page sheet on iOS and docked on Android', async () => {
      scope.UIModalPresentationStyle = { PageSheet: 1 };
      const modal = TestBed.inject(ModalDialogService);
      vi.mocked(modal.showModal).mockResolvedValue('result' as never);
      const opener = TestBed.createComponent(Opener).componentInstance;

      expect(await opener.open(Sheet, { id: 1 })).toBe('result');
      expect(modal.showModal).toHaveBeenLastCalledWith(Sheet, expect.objectContaining({ context: { id: 1 }, fullscreen: false, ios: undefined }));

      setPlatform('ios');
      await opener.open(Sheet, { id: 2 }, true);
      expect(modal.showModal).toHaveBeenLastCalledWith(Sheet, expect.objectContaining({ fullscreen: true, ios: undefined }));
      await opener.open(Sheet, { id: 3 });
      expect(modal.showModal).toHaveBeenLastCalledWith(Sheet, expect.objectContaining({ fullscreen: false, ios: { presentationStyle: 1 } }));
      delete scope.UIModalPresentationStyle;
    });
  });

  describe('Android docking', () => {
    const android = {
      view: {
        WindowManager: { LayoutParams: { SOFT_INPUT_ADJUST_RESIZE: 16 } },
        Gravity: { BOTTOM: 80 },
        ViewGroup: { LayoutParams: { MATCH_PARENT: -1, WRAP_CONTENT: -2 } },
      },
      graphics: { drawable: { ColorDrawable: class { constructor(public color: number) {} } } },
    };
    let sheet: Sheet;

    beforeEach(() => {
      scope.android = android;
      vi.useFakeTimers();
      TestBed.configureTestingModule({ providers: [Sheet, { provide: ModalDialogParams, useValue: new ModalDialogParams({ id: 1 }, () => undefined) }] });
      sheet = TestBed.inject(Sheet);
    });

    afterEach(() => {
      vi.useRealTimers();
      delete scope.android;
    });

    it('docks the sheet to the bottom of a transparent window', () => {
      const window = makeWindow();
      sheet.dockToBottom(androidView(window));
      expect(window.setGravity).toHaveBeenCalledWith(80);
      expect(window.setLayout).toHaveBeenCalledWith(-1, -2);
      expect(window.setBackgroundDrawable).toHaveBeenCalledWith(expect.objectContaining({ color: 0 }));
      expect(window.setSoftInputMode).toHaveBeenCalledWith(16);
    });

    it('resizes a full-screen form with the keyboard', () => {
      const window = makeWindow();
      sheet.avoidKeyboard(androidView(window));
      expect(window.setSoftInputMode).toHaveBeenCalledWith(16);
      expect(window.setGravity).not.toHaveBeenCalled();
    });

    it('retries until the window exists', () => {
      let window: ReturnType<typeof makeWindow> | null = null;
      const view = androidView(null);
      Object.assign(view, { _dialogFragment: { getDialog: () => (window ? { getWindow: () => window } : null) } });
      sheet.dockToBottom(view);
      vi.advanceTimersByTime(50);
      expect(view.listenerCount(View.unloadedEvent)).toBe(1);
      window = makeWindow();
      vi.advanceTimersByTime(50);
      expect(window.setGravity).toHaveBeenCalled();
      expect(view.listenerCount(View.unloadedEvent)).toBe(0);
    });

    it('gives up after a few attempts, or when the view is unloaded', () => {
      const view = androidView(null);
      const getDialog = vi.spyOn((view as unknown as { _dialogFragment: { getDialog(): unknown } })._dialogFragment, 'getDialog');
      sheet.avoidKeyboard(view);
      vi.advanceTimersByTime(1000);
      expect(getDialog).toHaveBeenCalledTimes(6);

      const gone = androidView(null);
      sheet.dockToBottom(gone);
      gone.notify(View.unloadedEvent);
      vi.advanceTimersByTime(1000);
      expect(gone.listenerCount(View.unloadedEvent)).toBe(0);
    });

    it('does nothing on other platforms', () => {
      setPlatform('none');
      const window = makeWindow();
      sheet.dockToBottom(androidView(window));
      sheet.avoidKeyboard(androidView(window));
      expect(window.setSoftInputMode).not.toHaveBeenCalled();
    });
  });

  describe('iOS sheets', () => {
    type Observer = { name: string; block: (notification: unknown) => void };
    let observers: Observer[];
    let removed: Observer[];
    let sheet: Sheet;
    let detents: { identifier: string; resolver?: (context: { maximumDetentValue: number }) => number }[];

    const notification = (height: number) => ({
      userInfo: { objectForKey: () => ({ CGRectValue: { size: { height } } }) },
    });
    const keyboard = (visible: boolean, height = 300): void => {
      const name = visible ? 'show' : 'hide';
      observers.filter((observer) => observer.name === name).forEach((observer) => observer.block(notification(height)));
    };
    const iosView = (content: View | undefined, controller: unknown): any => {
      const view = new View();
      view.getChildAt.mockReturnValue(content);
      Object.assign(view, { viewController: controller });
      return view;
    };
    const makeSheet = () => ({ detents: [] as unknown, selectedDetentIdentifier: '', invalidateDetents: vi.fn() });
    const controllerWith = (presentationController: unknown, bottom = 20) => ({ presentationController, view: { safeAreaInsets: { bottom } } });

    beforeEach(() => {
      setPlatform('ios');
      observers = [];
      removed = [];
      detents = [];
      Object.assign(scope, {
        NSNotificationCenter: {
          defaultCenter: {
            addObserverForNameObjectQueueUsingBlock: (name: string, _o: unknown, _q: unknown, block: Observer['block']) => {
              const observer = { name, block };
              observers.push(observer);
              return observer;
            },
            removeObserver: (observer: Observer) => removed.push(observer),
          },
        },
        NSOperationQueue: { mainQueue: {} },
        UIKeyboardWillShowNotification: 'show',
        UIKeyboardWillHideNotification: 'hide',
        UIKeyboardFrameEndUserInfoKey: 'frame',
        NSArray: { arrayWithObject: (object: unknown) => [object] },
        UISheetPresentationControllerDetent: {
          mediumDetent: () => ({ identifier: 'medium' }),
          customDetentWithIdentifierResolver: (identifier: string, resolver: (context: { maximumDetentValue: number }) => number) => {
            const detent = { identifier, resolver };
            detents.push(detent);
            return detent;
          },
        },
      });
      TestBed.configureTestingModule({ providers: [Sheet, { provide: ModalDialogParams, useValue: new ModalDialogParams({ id: 1 }, () => undefined) }] });
      sheet = TestBed.inject(Sheet);
    });

    afterEach(() => {
      for (const key of ['NSNotificationCenter', 'NSOperationQueue', 'UIKeyboardWillShowNotification', 'UIKeyboardWillHideNotification', 'UIKeyboardFrameEndUserInfoKey', 'NSArray', 'UISheetPresentationControllerDetent']) {
        delete scope[key];
      }
    });

    it('lifts a full-screen form above the keyboard until it is unloaded', () => {
      const content = new View();
      const view = iosView(content, controllerWith(undefined));
      sheet.avoidKeyboard(view);
      expect(observers.map((o) => o.name)).toEqual(['show', 'hide']);
      keyboard(true);
      expect(content.marginBottom).toBe(280);
      keyboard(false);
      expect(content.marginBottom).toBe(0);
      view.notify(View.unloadedEvent);
      expect(removed).toHaveLength(2);

      // Without a controller the whole keyboard height is used; without a frame nothing is lifted.
      const bare = new View();
      sheet.avoidKeyboard(iosView(bare, undefined));
      keyboard(true, 100);
      expect(bare.marginBottom).toBe(100);
      observers.at(-2)!.block({ userInfo: null });
      expect(bare.marginBottom).toBe(0);

      sheet.avoidKeyboard(iosView(undefined, undefined));
      expect(observers).toHaveLength(4);
    });

    it('ignores sheets without a presentation controller or detents', () => {
      sheet.dockToBottom(iosView(undefined, undefined));
      sheet.dockToBottom(iosView(new View(), controllerWith(undefined)));
      sheet.dockToBottom(iosView(new View(), controllerWith({})));
      expect(observers).toHaveLength(0);
    });

    it('uses the medium detent before iOS 16', () => {
      Device.osVersion = '15.4';
      const presentation = makeSheet();
      sheet.dockToBottom(iosView(new View(), controllerWith(presentation)));
      expect(presentation.detents).toEqual([{ identifier: 'medium' }]);
      expect(observers).toHaveLength(0);
    });

    it('fits the sheet to its content and grows it with the keyboard', () => {
      const content = new View();
      content.getActualSize.mockReturnValue({ width: 300, height: 400 });
      const presentation = makeSheet();
      const view = iosView(content, controllerWith(presentation));
      sheet.dockToBottom(view);

      expect(content.verticalAlignment).toBe('bottom');
      expect(presentation.selectedDetentIdentifier).toBe('content');
      expect(presentation.invalidateDetents).toHaveBeenCalledTimes(1);
      expect(detents[0].resolver!({ maximumDetentValue: 1000 })).toBe(420);
      expect(detents[0].resolver!({ maximumDetentValue: 100 })).toBe(100);

      // The same size again changes nothing; a keyboard lifts the content and grows the detent.
      content.notify(View.layoutChangedEvent);
      expect(presentation.invalidateDetents).toHaveBeenCalledTimes(1);
      keyboard(true, 320);
      expect(content.marginBottom).toBe(300);
      expect(detents[0].resolver!({ maximumDetentValue: 1000 })).toBe(720);
      keyboard(false);
      expect(content.marginBottom).toBe(0);
      expect(detents[0].resolver!({ maximumDetentValue: 1000 })).toBe(420);

      view.notify(View.unloadedEvent);
      expect(content.listenerCount(View.layoutChangedEvent)).toBe(0);
      expect(removed).toHaveLength(2);
    });

    it('waits for the content to be measured and copes with a missing safe area', () => {
      const content = new View();
      const presentation = makeSheet();
      sheet.dockToBottom(iosView(content, { presentationController: presentation }));
      expect(presentation.invalidateDetents).not.toHaveBeenCalled();
      expect(detents[0].resolver!({ maximumDetentValue: 500 })).toBe(500);
      content.getActualSize.mockReturnValue({ width: 300, height: 200 });
      content.notify(View.layoutChangedEvent);
      expect(detents[0].resolver!({ maximumDetentValue: 500 })).toBe(200);
    });
  });
});
