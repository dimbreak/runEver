import { Profile } from '../profile';

Profile.register({
  name: 'fileUpload',
  workWithSession: ['execution'],
  promptPreprocess: async <T extends Partial<Profile.ExePromptParts>>(
    sessionType: Profile.SessionType,
    promptParts: T,
  ) => {
    if (
      promptParts.userHeader &&
      promptParts.html &&
      promptParts.html.includes('type=file')
    )
      return {
        ...promptParts,
        userHeader: `${promptParts.userHeader ?? ''}

[file upload guide]
- using input action to upload, you can only put filename for **[readable file]** in the value
- allow operate hidden input type=file
- if user said attach/upload in goal, do not botherUser
- multiple files must in multiple string / args
`,
      };
    return promptParts;
  },
});
