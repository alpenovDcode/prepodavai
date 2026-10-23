import { Test, TestingModule } from '@nestjs/testing';
import { TutorExchangeNotifier } from './tutor-exchange-notifier.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TelegramService } from '../../telegram/telegram.service';

describe('TutorExchangeNotifier', () => {
  let notifier: TutorExchangeNotifier;
  let notifications: { createNotification: jest.Mock };
  let telegram: { sendToAppUser: jest.Mock };

  const dialog = {
    id: 'd-1',
    responderId: 'responder',
    lead: { id: 'lead-1', subject: 'Математика', creatorId: 'creator' },
  };

  beforeEach(async () => {
    notifications = { createNotification: jest.fn().mockResolvedValue({}) };
    telegram = { sendToAppUser: jest.fn().mockResolvedValue(true) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        TutorExchangeNotifier,
        { provide: NotificationsService, useValue: notifications },
        { provide: TelegramService, useValue: telegram },
      ],
    }).compile();

    notifier = mod.get(TutorExchangeNotifier);
  });

  it('notifyDialogCreated sends in-app + telegram to creator', async () => {
    await notifier.notifyDialogCreated(dialog);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator',
        type: 'tutor_exchange.dialog_created',
      }),
    );
    expect(telegram.sendToAppUser).toHaveBeenCalledWith('creator', expect.stringContaining('Математика'));
  });

  it('notifyTrialResult routes to creator with success flag', async () => {
    await notifier.notifyTrialResult(dialog, true);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'creator',
        type: 'tutor_exchange.trial_result',
        metadata: expect.objectContaining({ success: true }),
      }),
    );
  });

  it('notifyPaymentConfirmed routes to responder', async () => {
    await notifier.notifyPaymentConfirmed(dialog);
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'responder',
        type: 'tutor_exchange.payment_confirmed',
      }),
    );
  });

  it('notifyDisputeOpened notifies the other participant', async () => {
    await notifier.notifyDisputeOpened(dialog, 'responder');
    const call = notifications.createNotification.mock.calls[0][0];
    expect(call.userId).toBe('creator');
  });

  it('notifyRatingReceived — только in-app, без телеграма', async () => {
    await notifier.notifyRatingReceived({ rateeId: 'r', raterId: 'x', score: 5, dialogId: 'd-1' });
    expect(notifications.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'r', type: 'tutor_exchange.rating_received' }),
    );
    expect(telegram.sendToAppUser).not.toHaveBeenCalled();
  });

  describe('notifyMessageNew (debounced)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('collapses multiple calls within window into one delivery with total count', async () => {
      notifier.notifyMessageNew(dialog, 'responder', 'creator');
      notifier.notifyMessageNew(dialog, 'responder', 'creator');
      notifier.notifyMessageNew(dialog, 'responder', 'creator');

      // ничего пока не отправлено
      expect(notifications.createNotification).not.toHaveBeenCalled();

      jest.advanceTimersByTime(30_000);
      // flush pending promises
      await Promise.resolve();
      await Promise.resolve();

      expect(notifications.createNotification).toHaveBeenCalledTimes(1);
      const call = notifications.createNotification.mock.calls[0][0];
      expect(call.userId).toBe('creator');
      expect(call.type).toBe('tutor_exchange.message_new');
      expect(call.metadata.count).toBe(3);
    });

    it('separate recipients get separate deliveries', async () => {
      notifier.notifyMessageNew(dialog, 'a', 'b');
      notifier.notifyMessageNew(dialog, 'x', 'y');
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
      expect(notifications.createNotification).toHaveBeenCalledTimes(2);
    });
  });

  it('swallows in-app errors without throwing', async () => {
    notifications.createNotification.mockRejectedValue(new Error('db down'));
    await expect(notifier.notifyDialogCreated(dialog)).resolves.toBeUndefined();
  });
});
