
Editor = {
    editable: true,
    password: null,
    cipherJSON: null,
    saved: true,
    locked: false,
    encrypted: false,
    public: true,
    undoStack: []
};

Editor.init = function(container, options){
    var self = this;
    self.container = container;
    if (options){
        $.extend(self, options);
        self.locked = self.encrypted ? true : false;
    }

    // Editor
    self.updateView();
    var text = self.domToText(container);
    container.innerHTML = self.textToHTML(text);
    $(container)
        .on('keydown', null, 'meta+s', self.save)
        .on('keydown', null, 'ctrl+s', self.save)
        .on('keydown', null, 'meta+z', self.undo)
        .on('keydown', null, 'ctrl+z', self.undo)
        .on('keydown', null, 'meta+shift+z', self.redo)
        .on('keydown', null, 'ctrl+shift+z', self.redo)
        .keypress(self.keypress)
        .keyup(self.keyup)
        .on('click', 'a', function(){
            window.open(this.href, '_blank');
        })
        .focus();

    // Controls
    $('.unlocked').click(self.lock);
    $('#page_name').keyup(function(){
        this.value = this.value.toLowerCase().replace(/[^a-z0-9\_\.-]+/, '');
    });
    $('.save').click(self.save);
    $('.delete').click(self.delete);
    $('.settings').click(function(){
        $('#settings_dialog')
            .toggle()
            .find('input[type="password"]')
                .val(self.password)
            .end()
            .find('select[name="public"] option[value="' + self.public + '"]')
                .prop('selected', true)
            .end()
            .find('select[name="encrypted"] option[value="' + self.encrypted + '"]')
                .prop('selected', true)
                .closest('select')
                .change();
        if (self.locked){
            $('#decrypt_dialog').toggle();
            $('#settings_dialog .encryption').hide();
        } else {
            $('#editor').toggle();
            $('#settings_dialog .encryption').show();
        }
        return false;
    });

    // Dialogs
    $('#settings_dialog')
        .submit(self.saveSettings)
        .find('select[name="encrypted"]')
            .change(function(){
                var encrypted = $(this).find('option:selected').val();
                if (encrypted === 'true'){
                    $('.encrypt_password').show();
                } else {
                    $('.encrypt_password').hide();
                }
            });
    $('.lock').click(self.lock);
    $('.unlock').click(self.unlock);
    $('.close').click(function(){
        $(this).closest('.dialog').hide();
        if (self.locked){
            $('#decrypt_dialog').show();
        } else {
            $('#editor').show();
        }
        return false;
    });
};

Editor.keypress = function(e){
    // Return key Browser normalization.
    // Browsers use different elements as their 'empty' element:
    // http://lists.whatwg.org/pipermail/whatwg-whatwg.org/2011-May/031577.html
    if (e.keyCode === 13){
        var offsets = Editor.getCaretPositions(this);
        var text = Editor.domToText(this);

        // Delete selected text if exists
        text = text.slice(0, offsets[0]) + text.slice(offsets[1]);
        // Insert newline at first offset
        text = text.slice(0, offsets[0]) + '\n' + text.slice(offsets[0]);
        // Increment caret position
        offsets = [offsets[0] + 1, offsets[0] + 1];

        this.innerHTML = Editor.textToHTML(text);
        Editor.saved = false;
        $('.save').css('display', 'inline-block');
        Editor.setCaretPositions(offsets, this);
        Editor.updateUndoStack(this.innerHTML, offsets);
        Editor.checkMismatch(this, text);
        return false;
    }
};

Editor.keyup = function(e){
    // Skip arrow keys
    if (e.keyCode >= 37 && e.keyCode <= 40) return;
    var offsets = Editor.getCaretPositions(this);
    var text = Editor.domToText(this);
    var html = Editor.textToHTML(text);
    this.innerHTML = html;
    Editor.saved = false;
    $('.save').css('display', 'inline-block');
    Editor.setCaretPositions(offsets, this);
    Editor.updateUndoStack(this.innerHTML, offsets);
    Editor.checkMismatch(this, text);
};

Editor.save = function(){
    if (Editor.saved) return false;

    var data = {
        action: 'save',
        _xsrf: Editor.xsrf(),
        page_name: $('#page_name').val(),
        encrypted: Editor.encrypted,
        public: Editor.public
    };

    // Set the text/cipherJSON
    if (Editor.locked){
        data.text = Editor.cipherJSON;
    } else if (Editor.encrypted){
        var text = Editor.domToText(Editor.container);
        var cipherObj = sjcl.encrypt(Editor.password, text);
        Editor.cipherJSON = JSON.stringify(cipherObj);
        data.text = Editor.cipherJSON;
    } else {
        data.text = Editor.domToText(Editor.container);
    }
    console.log(data);

    $('.status').text('Saving...');
    $.post(location.href, data, function(response){
        if (response.indexOf('/') === 0){
            window.location.href = response;
        }
        $('.status').text('Saved');
        $('.save').hide();
        Editor.saved = true;
    });
    return false;
};

Editor.saveSettings = function(){
    var options = {};
    $(this)
        .serializeArray()
        .map(function(input){
            options[input.name] = input.value;
        });
    Editor.encrypted = options.encrypted === 'true' ? true : false;
    Editor.public = options.public === 'true' ? true : false;
    Editor.password = options.password;
    Editor.saved = false;
    Editor.save();
    $('#settings_dialog').hide();
    Editor.updateView();
    return false;
};

Editor.lock = function(){
    Editor.locked = true;
    Editor.save();
    $('input[type="password"]').val('');
    Editor.updateView();
    return false;
};

Editor.unlock = function(){
    var $password = $('#decrypt_dialog input[type="password"]');
    var password = $password.val();
    $password.val('');
    var cipherJSON = $.parseJSON(Editor.cipherJSON);
    var text = sjcl.decrypt(password, cipherJSON);
    Editor.container.innerHTML = Editor.textToHTML(text);
    Editor.password = password;
    Editor.locked = false;
    Editor.updateView();
    $('#decrypt_dialog').hide();
    return false;
};

Editor.delete = function(){
    if (confirm('Are you sure?')){
        $('.status').text('Deleting...');
        $.post('', {action: 'delete', _xsrf: Editor.xsrf()}, function(response){
            if (response.indexOf('/') === 0){
                window.location.href = response;
            } else {
                $('.status').text(response);
            }
        });
    }
    return false;
};

Editor.xsrf = function(){
    return /_xsrf=([a-z0-9]+)/.exec(document.cookie)[1];
};

Editor.undo = function(){
    var state = Editor.undoStack.pop();
    if (state){
        var html = state[0];
        var offsets = state[1];
        this.innerHTML = html;
        Editor.setCaretPositions(offsets, this);
    }
    console.log('undo');
    return false;
};

Editor.redo = function(){
    console.log('redo');
    return false;
};

Editor.updateView = function(){
    // Shows and hides ui elements based on state
    if (!this.editable){
        $('.controls').hide();
        return;
    }

    if (this.locked){
        $('#editor, .unlocked, .save').hide();
        $('#decrypt_dialog')
            .show()
            .focus();
    } else {
        if (this.encrypted){
            $('.unlocked').css('display', 'inline-block');
        } else {
            $('.unlocked').hide();
        }
        if (this.saved){
            $('.save').css('display', 'inline-block');
        } else {
            $('.save').hide();
        }
        $('#editor').show().focus();
    }
};

Editor.updateUndoStack = function(html, caretOffsets){
    var prev = Editor.undoStack[Editor.undoStack.length - 1];
    if (!prev || Math.abs(prev[0].length - html.length) > 10){
        Editor.undoStack.push([html, caretOffsets]);
    }
};

Editor.checkMismatch = function(container, text){
    var text2 = Editor.domToText(container);
    if (text2 != text){
        console.log('Mismatch!------------');
        console.log('DOM --> TXT:');
        console.log(text);
        console.log('TXT --> HTML:')
        console.log(container.innerHTML);
        console.log('HTML --> DOM --> TXT:');
        console.log(text2);
    }
};

Editor.partialUpdates = function(){
    // Ideas for only modifying part of the editor contents when text is modified
    // Make an HTML token list. Diff tokens lists first before modifying individual elements
    // Use html token list?
};

Editor.isBlockElement = function(node){
    var blockElements = 'H1,H2,H3,H4,H5,H6,DIV,BLOCKQUOTE,PRE';
    if (blockElements.indexOf(node.tagName) === -1){
        return false;
    }
    return true;
};

Editor.domToText = function(container){
    var text = '';
    var that = this;
    function traverse(node){
        if (node.nodeType === 3){
            // Text Node
            text += node.nodeValue;
        }

        if (node !== container && that.isBlockElement(node) && node.innerText === '\n'){
            // Chrome uses block elements that only contain a <br>
            // as 'filler' for the caret after a new line
            // <div><br></div>, <pre><br></pre>, etc.
            // Skip traversing child nodes
        } else if (node.hasChildNodes()){
            for (var i=0, child; child=node.childNodes[i]; i++){
                traverse(child);
            }
        }

        if (node !== container && that.isBlockElement(node) && node.nextSibling){
            // Add a new line at the end of block elements
            // if the element is followed by another block element
            text += '\n';
        }
    }
    traverse(container);
    return text;
};

Editor.textToHTML = function(text){
    var tokens = this.tokenize(text);
    var html = '';

    function allNewlines(){
        for (var i=0, token; token=tokens[i]; i++){
            if (token.type !== 'newline'){
                return false;
            }
        }
        return true;
    }

    function hasPrevBlock(index){
        for (var i=index, token; token=tokens[i]; i--){
            if (token.type !== 'newline'){
                return true;
            }
        }
        return false;
    }

    for (var i=0, token; token=tokens[i]; i++){
        if (token.type === 'newline'){
            var next = tokens[i + 1];
            if (i === 0 && allNewlines()){
                // If text is all newlines add an extra new line
                //  \n          <div><br></div>
                //              <div><br></div>
                //
                //  \n\n        <div><br></div>
                //              <div><br></div>
                //              <div><br></div>
                //
                html += '<div><br></div>';
            } else if (next && next.type !== 'newline' && hasPrevBlock(i)){
                // Skip a newline if next element is a block element
                // and there is previous block element before this one
                // a\na        <div>a</div>
                //             <div>a</div>
                // 
                // a\n\na      <div>a</div>
                //             <div><br></div>
                //             <div>a</div>
                continue;
            }
            html += '<div><br></div>';
        }
        if (token.type === 'heading'){
            html += '<h' + token.depth + '>' + this.inlineHTML(token.text) + '</h' + token.depth + '>';
            continue;
        }
        if (token.type === 'blockquote'){
            html += '<blockquote>' + this.inlineHTML(token.text) + '</blockquote>';
            continue;
        }
        if (token.type === 'hr'){
            html += '<div class="hr">' + this.inlineHTML(token.text) + '</div>';
            continue;
        }
        if (token.type === 'lh'){
            html += '<div class="lh">' + this.inlineHTML(token.text) + '</div>';
            continue;
        }
        if (token.type === 'li'){
            html += '<div class="li' + token.depth + '">' + this.inlineHTML(token.text) + '</div>';
            continue;
        }
        if (token.type === 'pre'){
            html += '<pre>' + this.escape(token.text) + '</pre>';
            continue;
        }
        if (token.type === 'div'){
            html += '<div>' + this.inlineHTML(token.text) + '</div>';
            continue;
        }
    }
    return html;
};

Editor.tokenize = function(text){
    var rules = {
        newline: /^\n/,
        heading: /^(#{1,6})[^\n]*/,
        blockquote: /^>[^\n]*/,
        li: /^(-{1,3})[^\n]*/,
        hr: /^-{4,}/,
        lh: /^[^\n]+:\n/,
        pre: /^```((?!```)[\s\S])+(```)?/,
        text: /^[^\n]+/
    };
    var tokens = [];
    var cap;

    while (text){
        // New lines
        if (cap = rules.newline.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'newline'
            });
            continue;
        }
        // Headings
        if (cap = rules.heading.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'heading',
                depth: cap[1].length,
                text: cap[0]
            });
            continue;
        }
        // Block quotes
        if (cap = rules.blockquote.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'blockquote',
                text: cap[0]
            });
            continue;
        }
        // Horizontal rules
        if (cap = rules.hr.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'hr',
                text: cap[0]
            });
            continue;
        }
        // List elements
        if (cap = rules.li.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'li',
                depth: cap[1].length,
                text: cap[0]
            });
            continue;
        }
        // List headers
        if (cap = rules.lh.exec(text)){
            var capTxt = cap[0].replace('\n', '');
            text = text.substring(capTxt.length);
            tokens.push({
                type: 'lh',
                text: capTxt
            });
            continue;
        }
        // Code blocks
        if (cap = rules.pre.exec(text)){
            text = text.substring(cap[0].length);
            var token = {
                type: 'pre',
                text: cap[0]
            };
            tokens.push(token);
            continue;
        }
        // Text
        if (cap = rules.text.exec(text)){
            text = text.substring(cap[0].length);
            tokens.push({
                type: 'div',
                text: cap[0]
            });
            continue;
        }
        if (text){
            alert('Big problems!!');
        }
    }
    return tokens;
};

Editor.escape = function(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

Editor.inlineHTML = function(text){
    var rules = {
        link: /^https?:\/\/[^\s<]+[^<.,:;"')\]\s]/,
        email: /^\S+@[a-z0-9-\.]+[a-z]/,
        code: /^`[^`]+`/,
        strong: /^\*\*[^\*]+?\*\*/,
        em: /^\*[^\*]+\*/
    };
    var html = '';

    while (text){
        // Links
        if (cap = rules.link.exec(text)){
            text = text.substring(cap[0].length);
            html += '<a href="' + this.escape(cap[0]) + '" rel="nofollow">' + this.escape(cap[0]) + '</a>';
            continue;
        }
        // Email
        if (cap = rules.email.exec(text)){
            text = text.substring(cap[0].length);
            html += '<a class="email" rel="nofollow" href="mailto:' + this.escape(cap[0]) + '">' + 
                this.escape(cap[0]) + 
            '</a>';
            continue;
        }
        // Code
        if (cap = rules.code.exec(text)){
            text = text.substring(cap[0].length);
            html += '<code>' + this.escape(cap[0]) + '</code>';
            continue;
        }
        // Strong
        if (cap = rules.strong.exec(text)){
            text = text.substring(cap[0].length);
            html += '<strong>' + this.escape(cap[0]) + '</strong>';
            continue;
        }
        // Em
        if (cap = rules.em.exec(text)){
            text = text.substring(cap[0].length);
            html += '<em>' + this.escape(cap[0]) + '</em>';
            continue;
        }
        // Text
        html += this.escape(text[0]);
        text = text.substring(1);
    }
    return html;
};

Editor.getCaretPositions = function(element){
    // Returns the 0-indexed character offsets of the caret in
    // a contenteditable element.
    // 
    // https://developer.mozilla.org/en-US/docs/Web/API/Range.startOffset
    var range = window.getSelection().getRangeAt(0);

    //console.log('startRange:', range.startContainer, range.startOffset);
    //console.log('endRange:', range.endContainer, range.endOffset);

    function findOffset(node, container, rangeOffset, state){
        // Traverses the node tree depth-first to find a
        // range's character offset
        state = state || {finished: false};
        var offset = 0;

        if (node === container){
            // Found a match
            state.finished = true;

            if (node.nodeType === 3){
                // Text node: rangeOffset == n'th character
                offset += rangeOffset;
            } else {
                // Non-text node: rangeOffset == n child nodes
                for (var i=0; i < rangeOffset; i++){
                    offset += findOffset(node.childNodes[i], container, rangeOffset, state);
                }
            }
            return offset;
        } 

        if (node.nodeType === 3){
            // Text Node
            offset += node.nodeValue.length;
        }

        if (node.hasChildNodes()){
            for (var i=0, child; child=node.childNodes[i]; i++){
                offset += findOffset(child, container, rangeOffset, state);
                if (state.finished){
                    return offset;
                }
            }
        }

        if (Editor.isBlockElement(node)){
            // The end of <h1> or <div> counts as new line
            offset += 1;
        }
        return offset;
    }

    var startOffset = findOffset(element, range.startContainer, range.startOffset);
    var endOffset = findOffset(element, range.endContainer, range.endOffset);

    return [startOffset, endOffset];
};

Editor.setCaretPositions = function(offsets, element){
    // Sets the caret positions on a content editable DOM element

    function findOffset(node, offset){
        if (node.nodeType === 3){
            // Text node
            if (offset <= node.nodeValue.length){
                return [node, offset];
            }
            offset -= node.nodeValue.length;
        }

        if (offset === 0){
            return [node, offset];
        }

        if (node.hasChildNodes()){
            for (var i=0, child; child=node.childNodes[i]; i++){
                var result = findOffset(child, offset);
                offset = result[1];
                if (result[0] !== null){
                    return result;
                }
            }
        } 

        if (Editor.isBlockElement(node)){
            // The end of <h1> or <div> counts as new line
            offset -= 1;
        }
        return [null, offset];
    }

    var range = document.createRange();
    var sel = window.getSelection();
    var startOffset = findOffset(element, offsets[0]);
    range.setStart(startOffset[0], startOffset[1]);

    if (offsets[0] === offsets[1]){
        range.collapse(true);
    } else {
        var endOffset = findOffset(element, offsets[1]);
        range.setEnd(endOffset[0], endOffset[1]);
    }

    sel.removeAllRanges();
    sel.addRange(range);
};







