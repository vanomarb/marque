export interface ContactInput {
  name: string
  business: string
  message: string
}

export type ContactErrors = Partial<Record<keyof ContactInput, string>>

/** An empty object means the form can go. */
export function validateContact(input: ContactInput): ContactErrors {
  const errors: ContactErrors = {}
  const name = input.name.trim()
  const business = input.business.trim()
  const message = input.message.trim()
  if (!name) errors.name = 'Enter your name.'
  else if (name.length < 2 || name.length > 60) errors.name = 'Use 2 to 60 characters for your name.'
  if (!business) errors.business = 'Enter the name of your business.'
  else if (business.length < 2 || business.length > 60) errors.business = 'Use 2 to 60 characters for the business name.'
  if (!message) errors.message = 'Tell us about the project, or use the brief from the builder.'
  else if (message.length < 10) errors.message = 'Write at least 10 characters about the project.'
  return errors
}
