
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
    var text = $(container).text();
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
        .on('click', function(){
            Editor.updateActive();
        })
        .on('click', 'a', function(){
            window.open(this.href, '_blank');
        })
        .focus();

    // Controls
    $('.unlocked').click(self.lock);
    $('#page_name').keyup(function(){
        var value = this.value.toLowerCase()
            .replace(/\s+/, '-')
            .replace(/[^a-z0-9\_\.-]+/, '');
        if (value !== this.value){
            this.value = value;
        }
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
        var editor = document.getElementById('editor');
        var range = window.getSelection().getRangeAt(0);
        if (!range.collapsed) range.deleteContents();
        var caret = Editor.getCaretPosition();
        var container = caret.node;
        var text = container.textContent || container.innerText;;

        // Insert newline at first offset
        text = text.slice(0, caret.offset) + '\n' + text.slice(caret.offset);
        // Increment caret position
        caret.offset++;

        for (var cIndex=0, n=container; n=n.previousSibling; cIndex++);

        var newContainer = document.createElement('div');
        editor.replaceChild(newContainer, container);
        var html = Editor.textToHTML(text);
        console.log(text.replace(/\n/g, 'N'),  html);
        newContainer.outerHTML = html;

        Editor.saved = false;
        $('.save').css('display', 'inline-block');

        newContainer = editor.childNodes[cIndex];
        Editor.setCaretPosition(newContainer, caret.offset);

        Editor.updateActive();

        //Editor.updateUndoStack(this.innerHTML, offsets);
        //Editor.checkMismatch(this, text);
        return false;
    }
};

Editor.updateActive = function(){
    $('#editor .active').removeClass('active');
    var range = window.getSelection().getRangeAt(0);
    var editor = document.getElementById('editor');
    for (var node=range.startContainer; node && node.parentElement !== editor; node=node.parentElement);
    $(node).addClass('active');
};

Editor.keyup = function(e){
    // Skip arrow keys and enter key
    //if (e.keyCode >= 37 && e.keyCode <= 40 || e.keyCode === 13) return;

    var editor = document.getElementById('editor');
    var caret = Editor.getCaretPosition();
    var container = caret.node;
    var containerIndex = Array.prototype.indexOf.call(editor.childNodes, container);
    var text = container.textContent || container.innerText;
    var html = Editor.textToHTML(text);

    var newContainer = document.createElement('div');
    editor.replaceChild(newContainer, container);
    newContainer.outerHTML = html;

    Editor.saved = false;
    $('.save').css('display', 'inline-block');

    newContainer = editor.childNodes[containerIndex];

    $('#editor .active').removeClass('active');
    $(newContainer).addClass('active');

    Editor.setCaretPosition(newContainer, caret.offset);
    //Editor.updateUndoStack(this.innerHTML, offsets);
    //Editor.checkMismatch(this, text);
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
        var text = Editor.getText();
        var cipherObj = sjcl.encrypt(Editor.password, text);
        Editor.cipherJSON = JSON.stringify(cipherObj);
        data.text = Editor.cipherJSON;
    } else {
        data.text = Editor.getText();
    }
    console.log(data);

    $('#status').text('Saving...');
    $.post(location.href, data, function(response){
        if (response.indexOf('/') === 0){
            window.location.href = response;
        }
        $('#status').text('Saved');
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
        $('#status').text('Deleting...');
        $.post('', {action: 'delete', _xsrf: Editor.xsrf()}, function(response){
            if (response.indexOf('/') === 0){
                window.location.href = response;
            } else {
                $('#status').text(response);
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


Editor.isBrNode = function(node){
    return node && (node.textContent || node.innerText) === '\n';
};

Editor.getText = function(){
    var text = '';
    for (var node, i=0; node=this.container.childNodes[i]; i++){
        if (this.isBrNode(node)){
            // BR elements
            text += '\n';
        } else {
            // Block elements (everything but BRs)
            // innerText for IE < 9
            text += (node.textContent || node.innerText);

            // Add a newline if block element is followed by another element
            if (node.nextSibling){
                text += '\n';
            }
        }
    }
    return text;
}

Editor.textToHTML = function(text){
    var tokens = this.tokenize(text);
    var html = '';

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
            if (next && next.type !== 'newline' && hasPrevBlock(i)){
                // Skip a newline if next element is a block element
                // and there is a previous block element
                // a\na        <div>a</div>
                //             <div>a</div>
                // 
                // a\n\na      <div>a</div>
                //             <div><br></div>
                //             <div>a</div>
                continue;
            }
            html += '<div class="br"><br></div>';
        }
        if (token.type === 'heading'){
            html += '<h' + token.depth + '><span class="hidden">' + token.hashes + '</span>' +
                this.inlineHTML(token.text) + '</h' + token.depth + '>';
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
        heading: /^(#{1,6})([^\n]*)/,
        blockquote: /^>[^\n]*/,
        li: /^(-{1,3})[^\n]*/,
        hr: /^-{4,}/,
        lh: /^([^\n]+:)(\n|$)/,
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
                hashes: cap[1],
                text: cap[2]
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
            text = text.substring(cap[1].length);
            tokens.push({
                type: 'lh',
                text: cap[1]
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
        strong: /^\*\*([^\*]+?)\*\*/,
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
            html += '<strong><span class="hidden">**</span>' + this.escape(cap[1]) + 
                '<span class="hidden">**</span></strong>';
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

Editor.getCaretPosition = function(){
    // Returns the 0-indexed character offset of the caret in the editor
    var range = window.getSelection().getRangeAt(0);
    var editor = document.getElementById('editor');
    var node = range.startContainer;
    var offset = range.startOffset;

    // Traverses up the DOM tree to find the character offset from the editor element.
    if (node.nodeType === 3){
        // Text node: offset == n'th character
        // https://developer.mozilla.org/en-US/docs/Web/API/Range.startOffset
    } else {
        // Non-text node: offset == n'th child node
        node = node.childNodes[offset];
        offset = 0;
    }

    while (node){
        if (node.parentElement === editor){
            break;
        } else if (node.previousSibling){
            node = node.previousSibling;
            if (this.isBrNode(node)){
                offset++;
            } else {
                offset += node.textContent.length;
            }
        } else {
            node = node.parentElement;
        }
    }
    return {node: node, offset: offset};
};

Editor.setCaretPosition = function(node, offset){
    // Sets the caret position on a DOM element
    // Find offset on first-level element
    while (node){
        var textLen = (node.textContent || node.innerText).length;
        if (!this.isBrNode(node)){
            // Add 1 for a newline at the end of block elements
            textLen++;
        }
        if (offset >= textLen){
            offset -= textLen;
        } else {
            break;
        }
        node = node.nextSibling;
    }

    // Now find offset from inner text node
    function findTextNodeOffset(node, offset){
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
                var result = findTextNodeOffset(child, offset);
                offset = result[1];
                if (result[0] !== null){
                    return result;
                }
            }
        }
        return [null, offset];
    }
    
    var range = document.createRange();
    var sel = window.getSelection();
    var textNodeOffset = findTextNodeOffset(node, offset);
    range.setStart(textNodeOffset[0], textNodeOffset[1]);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
};



