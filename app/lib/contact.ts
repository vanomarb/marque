import { emailProblem } from './account.ts'

export interface ContactInput {
  name: string
  business: string
  /** Where the reply goes. */
  email: string
  message: string
}

/** The `maxlength` of each box on the Start page; a test holds the HTML to these. */
export const CONTACT_LIMITS = { name: 60, business: 60, email: 254, message: 4000 } as const

export type ContactErrors = Partial<Record<keyof ContactInput, string>>

/** An empty object means the form can go. */
export function validateContact(input: ContactInput): ContactErrors {
  const errors: ContactErrors = {}
  const name = input.name.trim()
  const business = input.business.trim()
  const message = input.message.trim()
  if (!name) errors.name = 'Enter your name.'
  else if (name.length < 2 || name.length > CONTACT_LIMITS.name) errors.name = `Use 2 to ${CONTACT_LIMITS.name} characters for your name.`
  if (!business) errors.business = 'Enter the name of your business.'
  else if (business.length < 2 || business.length > CONTACT_LIMITS.business) errors.business = `Use 2 to ${CONTACT_LIMITS.business} characters for the business name.`
  const emailError = emailProblem(input.email)
  if (emailError) errors.email = emailError
  if (!message) errors.message = 'Tell us about the project, or press Use this brief to add your estimate.'
  else if (message.length < 10) errors.message = 'Write at least 10 characters about the project.'
  else if (message.length > CONTACT_LIMITS.message) errors.message = `Keep the message to ${CONTACT_LIMITS.message.toLocaleString('en-US')} characters.`
  return errors
}
