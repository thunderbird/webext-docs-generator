=============================
Changes in Manifest Version 3
=============================

Thunderbird 128 is the first Thunderbird release to officially support Manifest Version 3.

A general introduction to Manifest V3 and the required changes is provided by `extensionworkshop.com <https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/>`__. Thunderbird's add-on team made additional changes to its WebExtension APIs, to remove inconsistencies. This page
documents these backward incompatible changes from Manifest V2 to Manifest V3.

Additionally, the examples in our `sample repository <https://github.com/thunderbird/sample-extensions>`__ have been converted to Manifest V3, and might give helpful insights.

accounts API
============
* Default value for the ``includeSubFolders`` parameter of :ref:`accounts.list` has been changed from ``true`` to ``false``.
* Default value for the ``includeSubFolders`` parameter of :ref:`accounts.get` has been changed from ``true`` to ``false``.
* Default value for the ``includeSubFolders`` parameter of :ref:`accounts.getDefault` has been changed from ``true`` to ``false``.
* The function ``accounts.setDefaultIdentity`` has been removed, use :ref:`identities.getDefault` instead.
* The ``folders`` property of the :ref:`accounts.MailAccount` type has been replaced by the ``rootFolder`` property.
* The ``type`` property of the :ref:`accounts.MailAccount` type uses ``local`` instead of ``none`` for local accounts.

contacts API
============
* Replaced by :doc:`/addressBooks.contacts`.
* The :ref:`addressBooks.contacts.ContactNode` type no longer has a ``ContactProperties`` property, but a ``vCard`` property. It is no longer possible to specify individual contact properties.
* The :ref:`addressBooks.contacts.onUpdated` event provides the entire old vCard in its second parameter, instead of individual changed properties.
* The ``parentId`` is no longer a dedicated parameter for :ref:`addressBooks.contacts.query`, but an optional property for its ``queryInfo`` parameter.
* The function :ref:`addressBooks.contacts.create` expects a vCard for its second parameter, instead of individual properties. It also no longer has a dedicated parameter to specify an id, which is now provided via the vCard.
* The function :ref:`addressBooks.contacts.update` expects a vCard for its second parameter, instead of individual properties.

mailingLists API
================
* Replaced by :doc:`/addressBooks.mailingLists`.


browserAction API
=================
* Replaced by :doc:`/action`

commands API
============
* The built-in ``_execute_browser_action`` command shortcut for the ``commands`` manifest entry has been renamed to ``_execute_action``.

compose API
===========
* The ``id`` property of the :ref:`compose.ComposeRecipient` type has been renamed to ``nodeId``.
* The ``additionalFccFolder`` property of the :ref:`compose.ComposeDetails` type has been replaced by the ``additionalFccFolderId`` property (expecting a :ref:`folders.MailFolderId`).
* The ``overrideDefaultFccFolder`` property of the :ref:`compose.ComposeDetails` type has been replaced by the ``overrideDefaultFccFolderId`` property (expecting a :ref:`folders.MailFolderId`).
* The ``overrideDefaultFcc`` property of the :ref:`compose.ComposeDetails` has been removed. An override can now be cleared by setting ``overrideDefaultFccFolderId`` to ``null``.

composeScripts API
==================
* Replaced by :doc:`/scripting.compose`.

folders API
===========
* The ``type`` property of :ref:`folders.MailFolder` has been removed. Use the ``specialUse`` property instead.
* The ``favorite`` property of :ref:`folders.MailFolderInfo` has been removed. It is now available as a property of :ref:`folders.MailFolder`.
* The ``type`` property of the ``queryInfo`` parameter of :ref:`folders.query` has been removed. Use the ``specialUse`` property instead.
* Default value for the ``includeSubFolders`` parameter of :ref:`folders.get` has been changed from ``true`` to ``false``.
* :ref:`folders.create` no longer accepts a :ref:`folders.MailFolder` or :ref:`accounts.MailAccount` for its first parameter, but a :ref:`folders.MailFolderId`. Use ``MailAccount.rootFolder`` to specify the root of an account.
* :ref:`folders.rename` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.
* :ref:`folders.move` no longer accepts a :ref:`folders.MailFolder` or :ref:`accounts.MailAccount` for its parameters, but a :ref:`folders.MailFolderId`. Use ``MailAccount.rootFolder`` to specify the root of an account.
* :ref:`folders.copy` no longer accepts a :ref:`folders.MailFolder` or :ref:`accounts.MailAccount` for its parameters, but a :ref:`folders.MailFolderId`. Use ``MailAccount.rootFolder`` to specify the root of an account.
* :ref:`folders.delete` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.
* :ref:`folders.update` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.
* :ref:`folders.getFolderInfo` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.
* :ref:`folders.getFolderCapabilities` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.
* :ref:`folders.getParentFolders` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.
* :ref:`folders.getSubFolders` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.
* Default value for the ``includeSubFolders`` parameter of :ref:`folders.getSubFolders` has been changed from ``true`` to ``false``.
* :ref:`folders.markAsRead` no longer accepts a :ref:`folders.MailFolder` for its first parameter, but a :ref:`folders.MailFolderId`.

mailTabs API
============
* The ``mailTabs.getCurrent()`` function has been removed, use :code:`messenger.mailTabs.query({active:true, currentWindow: true})` instead.
* The ``id`` property of :ref:`mailTabs.MailTab` has been replaced by the ``tabId`` property.
* The ``viewType`` property of :ref:`mailTabs.MailTab` and :ref:`mailTabs.MailTabProperties` has been replaced by the ``groupType`` property.
* The ``displayedFolder`` property of :ref:`mailTabs.MailTabProperties` has been replaced by the ``displayedFolderId`` property, and no longer accepts a :ref:`folders.MailFolder`, but a :ref:`folders.MailFolderId`.

menus API
=========
* The built-in ``_execute_browser_action`` shortcut for the ``command`` property of the ``createProperties`` parameter of :ref:`menus.create` has been renamed to ``_execute_action``.
* The values ``browser_action`` and ``browser_action_menu`` of :ref:`menus.ContextType` have been renamed to ``action`` and ``action_menu``.
* The ``selectedAccount`` and ``selectedFolder`` properties have been removed from :ref:`menus.OnShowData` and :ref:`menus.OnClickData`. Use the ``selectedFolders`` property instead.

messageDisplay API
==================
* The ``messageDisplay.onMessageDisplayed`` event has been removed, use :ref:`messageDisplay.onMessagesDisplayed` instead.
* The :ref:`messageDisplay.onMessagesDisplayed` event returns a :ref:`messages.MessageList` instead of an array of :ref:`messages.MessageHeader`.
* The ``messageDisplay.getDisplayedMessage()`` function has been removed, use :ref:`messageDisplay.getDisplayedMessages` instead.
* The :ref:`messageDisplay.getDisplayedMessages` function returns a :ref:`messages.MessageList` instead of an array of :ref:`messages.MessageHeader`.

messageDisplayScripts API
=========================
* Replaced by :doc:`/scripting.messageDisplay`.

messages API
============
* The :ref:`messages.list` function no longer accepts a :ref:`folders.MailFolder`, but a :ref:`folders.MailFolderId`.
* The default value for the ``data_format`` parameter of :ref:`messages.getRaw` has been changed from ``BinaryString`` to ``File``.
* The ``queryInfo`` parameter of :ref:`messages.query` no longer supports the ``folder`` property, use the ``folderId`` property instead.
* The ``queryInfo`` parameter of :ref:`messages.query` no longer supports the ``unread`` property, use the ``read`` property instead.
* The :ref:`messages.move` function no longer accepts a :ref:`folders.MailFolder`, but a :ref:`folders.MailFolderId` for its first parameter.
* The :ref:`messages.copy` function no longer accepts a :ref:`folders.MailFolder`, but a :ref:`folders.MailFolderId` for its first parameter.
* The :ref:`messages.import` function no longer accepts a :ref:`folders.MailFolder`, but a :ref:`folders.MailFolderId` for its second parameter.
* The ``messages.listTags()``, ``messages.createTag()`` and ``messages.updateTag()`` functions have been replaced by :ref:`messages.tags.list`, :ref:`messages.tags.create` and :ref:`messages.tags.update`.

spaces API
==========
* The ``id`` property of the ``queryInfo`` parameter of :ref:`spaces.query` has been renamed to ``spaceId``.

spacesToolbar API
=================
* The ``spacesToolbar API`` has been removed, use :doc:`/spaces` instead.

tabs API
========
* The ``mailTab`` property of the ``queryInfo`` parameter of :ref:`mailTabs.query` has been removed. Use the ``type`` property instead.
* The ``mailTab`` property of :ref:`mailTabs.MailTab` has been removed. Use the ``type`` property instead.
* The ``tabs.executeScript`` and ``tabs.insertCSS`` functions have been removed. Use :doc:`/scripting`, :doc:`/scripting.compose` or :doc:`/scripting.messageDisplay` instead. **Note**: It is no longer possible to execute a JavaScript string in Manifest V3.
