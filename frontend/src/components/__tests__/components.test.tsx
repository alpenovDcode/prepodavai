/**
 * Простые тесты для проверки компонентов
 * Для полноценного тестирования нужно установить @testing-library/react и jest
 */

describe('Components', () => {
  it('should export ImageResultDisplay', () => {
    // Простая проверка что компонент экспортируется
    const ImageResultDisplay = require('../ImageResultDisplay').default
    expect(ImageResultDisplay).toBeDefined()
  })

  it('should export GenerationHistory', () => {
    const GenerationHistory = require('../GenerationHistory').default
    expect(GenerationHistory).toBeDefined()
  })

  it('should export InputComposer', () => {
    const InputComposer = require('../InputComposer').default
    expect(InputComposer).toBeDefined()
  })

  it('should export WebAppIndex', () => {
    const WebAppIndex = require('../WebAppIndex').default
    expect(WebAppIndex).toBeDefined()
  })

  it('should export LandingPage', () => {
    const LandingPage = require('../LandingPage').default
    expect(LandingPage).toBeDefined()
  })

  it('should export AuthModal', () => {
    const AuthModal = require('../AuthModal').default
    expect(AuthModal).toBeDefined()
  })
})

